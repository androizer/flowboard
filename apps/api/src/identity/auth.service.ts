import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config, createRefreshSecret, hashRefresh } from '../persistence/runtime.config';
import { PrismaService } from '../persistence/prisma.service';

type SessionTokens = { accessToken: string; refreshToken: string; refreshExpiresAt: Date };

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}
  private settings() {
    return config();
  }
  private sign(userId: string, sessionId: string, expiresAt: Date) {
    const s = this.settings();
    const seconds = Math.max(
      1,
      Math.min(600, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    );
    return jwt.sign({ sid: sessionId }, s.secret, {
      algorithm: 'HS256',
      issuer: s.issuer,
      audience: s.audience,
      subject: userId,
      jwtid: crypto.randomUUID(),
      expiresIn: seconds,
    });
  }
  async login(loginIdentifier: string, password: string): Promise<SessionTokens> {
    const normalized = loginIdentifier.trim().toLowerCase();
    const credential = await this.prisma.userCredential.findUnique({
      where: { loginIdentifier: normalized },
      include: {
        user: { include: { identities: true, memberships: { where: { isActive: true } } } },
      },
    });
    if (
      !credential ||
      !credential.user.isActive ||
      !(await argon2.verify(credential.passwordHash, password))
    )
      throw new UnauthorizedException('Invalid login credentials.');
    const local = credential.user.identities.find(
      (i) => i.issuer === 'urn:flowboard:local' && i.subject === credential.userId,
    );
    if (!local) throw new ForbiddenException('Local sign-in is not configured for this user.');
    const membership = credential.user.memberships[0];
    if (!membership) throw new ForbiddenException('No active workspace membership.');
    return this.createSession(credential.userId, local.id);
  }
  private async createSession(userId: string, authIdentityId: string): Promise<SessionTokens> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const refreshToken = createRefreshSecret();
    const session = await this.prisma.authSession.create({
      data: { userId, authIdentityId, expiresAt },
    });
    await this.prisma.refreshToken.create({
      data: { sessionId: session.id, tokenHash: hashRefresh(refreshToken), expiresAt },
    });
    return {
      accessToken: this.sign(userId, session.id, expiresAt),
      refreshToken,
      refreshExpiresAt: expiresAt,
    };
  }
  async refresh(rawToken: string): Promise<SessionTokens> {
    const tokenHash = hashRefresh(rawToken);
    const now = new Date();
    let outcome: { replayed: true } | { replayed: false; tokens: SessionTokens };
    try {
      outcome = await this.prisma.$transaction(
        async (tx) => {
          const token = await tx.refreshToken.findUnique({
            where: { tokenHash },
            include: { session: true },
          });
          if (
            !token ||
            token.expiresAt <= now ||
            token.session.expiresAt <= now ||
            token.session.revokedAt
          )
            throw new UnauthorizedException('Refresh session is unavailable.');
          if (token.consumedAt) {
            await tx.authSession.update({
              where: { id: token.sessionId },
              data: { revokedAt: now },
            });
            // Return normally so Prisma commits family revocation. Throwing from
            // the transaction callback would roll this security write back.
            return { replayed: true as const };
          }
          const successor = createRefreshSecret();
          await tx.refreshToken.update({ where: { id: token.id }, data: { consumedAt: now } });
          await tx.refreshToken.create({
            data: {
              sessionId: token.sessionId,
              parentTokenId: token.id,
              tokenHash: hashRefresh(successor),
              expiresAt: token.session.expiresAt,
            },
          });
          return {
            replayed: false as const,
            tokens: {
              accessToken: this.sign(
                token.session.userId,
                token.sessionId,
                token.session.expiresAt,
              ),
              refreshToken: successor,
              refreshExpiresAt: token.session.expiresAt,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (code === 'P2034' || code === 'P2002') {
        const racedToken = await this.prisma.refreshToken.findUnique({
          where: { tokenHash },
          include: { session: true },
        });
        if (racedToken?.consumedAt) {
          await this.prisma.authSession.updateMany({
            where: { id: racedToken.sessionId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          throw new UnauthorizedException('Refresh session is unavailable.');
        }
      }
      throw error;
    }
    if (outcome.replayed) throw new UnauthorizedException('Refresh session is unavailable.');
    return outcome.tokens;
  }
  async logout(sessionId: string) {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async logoutAll(userId: string) {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async members(workspaceId: string, offset: number, limit: number) {
    const where = { workspaceId, isActive: true, user: { isActive: true } };
    const [total, rows] = await Promise.all([
      this.prisma.workspaceMembership.count({ where }),
      this.prisma.workspaceMembership.findMany({
        where,
        include: { user: true },
        orderBy: { userId: 'asc' },
        skip: offset,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((row) => ({ id: row.userId, name: row.user.displayName })),
      page: { offset, limit, total, hasMore: offset + limit < total },
    };
  }
  async freshActor(actor: { userId: string; workspaceId: string }, db: Prisma.TransactionClient) {
    const membership = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.userId } },
      include: { user: true },
    });
    if (!membership?.isActive || !membership.user.isActive)
      throw new ForbiddenException('Membership is inactive.');
    return { userId: actor.userId, workspaceId: actor.workspaceId, role: membership.role };
  }
  async eligibleAssigneeIds(workspaceId: string, ids: string[], db: Prisma.TransactionClient) {
    const rows = await db.workspaceMembership.findMany({
      where: { workspaceId, userId: { in: ids }, isActive: true, user: { isActive: true } },
    });
    return rows.map((row) => row.userId);
  }
  async actor(accessToken: string) {
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(accessToken, this.settings().secret, {
        algorithms: ['HS256'],
        issuer: this.settings().issuer,
        audience: this.settings().audience,
      }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid access token.');
    }
    if (!decoded.sub || typeof decoded.sid !== 'string')
      throw new UnauthorizedException('Invalid access token.');
    const session = await this.prisma.authSession.findUnique({
      where: { id: decoded.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== decoded.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    )
      throw new UnauthorizedException('Access session is unavailable.');
    const membership = await this.prisma.workspaceMembership.findFirst({
      where: { userId: session.userId, isActive: true },
    });
    if (!membership) throw new ForbiddenException('No active workspace membership.');
    return {
      userId: session.userId,
      workspaceId: membership.workspaceId,
      role: membership.role as MembershipRole,
    };
  }
}
