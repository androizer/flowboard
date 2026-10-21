import { ForbiddenException, Injectable } from '@nestjs/common';
import { Container, ContainerGrant, GrantMode } from '@prisma/client';
import { HierarchyService, DomainDb } from '../hierarchy/hierarchy.service';
import { PrismaService } from '../persistence/prisma.service';

export type DomainActor = { userId: string; workspaceId: string; role: 'admin' | 'member' };

/** Resolves container access from visibility, membership, and direct grants. */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: HierarchyService,
  ) {}

  /** Requires the workspace admin role for configuration changes. */
  assertAdmin(actor: DomainActor) {
    if (actor.role !== 'admin') throw new ForbiddenException('Admin access is required.');
  }

  /** Lists direct access rules on one container. */
  async grants(workspaceId: string, containerId: string, db: DomainDb) {
    return db.containerGrant.findMany({
      where: { workspaceId, containerId },
      orderBy: { userId: 'asc' },
    });
  }

  /** Creates or replaces one user’s direct allow or deny rule. */
  async putGrant(
    workspaceId: string,
    containerId: string,
    userId: string,
    mode: GrantMode,
    db: DomainDb,
  ) {
    return db.containerGrant.upsert({
      where: { workspaceId_containerId_userId: { workspaceId, containerId, userId } },
      create: { workspaceId, containerId, userId, mode },
      update: { mode },
    });
  }

  /** Removes one direct rule so inherited access applies again. */
  async deleteGrant(workspaceId: string, containerId: string, userId: string, db: DomainDb) {
    await db.containerGrant.deleteMany({ where: { workspaceId, containerId, userId } });
  }

  /** Checks a path from root to leaf: deny wins, while an allow carries into descendants. */
  private allowed(path: Container[], grants: ContainerGrant[], actor: DomainActor) {
    if (actor.role === 'admin') return true;
    let inheritedAllow = false;
    for (const node of path) {
      const grant = grants.find((item) => item.containerId === node.id);
      if (grant?.mode === 'deny') return false;
      if (grant?.mode === 'allow') inheritedAllow = true;
      if (node.visibility === 'private' && !inheritedAllow) return false;
    }
    return true;
  }

  /** Rejects access when a member cannot see every step of a container path. */
  async assertPath(actor: DomainActor, path: Container[], db: DomainDb = this.prisma) {
    const grants =
      actor.role === 'admin'
        ? []
        : await db.containerGrant.findMany({
            where: {
              workspaceId: actor.workspaceId,
              userId: actor.userId,
              containerId: { in: path.map((node) => node.id) },
            },
          });
    if (!this.allowed(path, grants, actor))
      throw new ForbiddenException('Resource is not accessible.');
  }

  /** Checks both the list’s hierarchy and the caller’s access to it. */
  async assertList(actor: DomainActor, listId: string, db: DomainDb = this.prisma) {
    const path = await this.hierarchy.listPath(actor.workspaceId, listId, db);
    await this.assertPath(actor, path, db);
    return path;
  }

  /** Returns only accessible live branches, loading the member’s grants once. */
  async filteredTree(actor: DomainActor, db: DomainDb = this.prisma) {
    const nodes = await this.hierarchy.activeTree(actor.workspaceId, db);
    if (actor.role === 'admin') return nodes;
    const grants = await db.containerGrant.findMany({
      where: { workspaceId: actor.workspaceId, userId: actor.userId },
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const visible = new Set<string>();
    for (const node of nodes) {
      const path: Container[] = [];
      let current: Container | undefined = node;
      while (current) {
        path.unshift(current);
        current = current.parentContainerId ? byId.get(current.parentContainerId) : undefined;
      }
      if (path[0]?.type === 'space' && this.allowed(path, grants, actor)) visible.add(node.id);
    }
    return nodes.filter((node) => visible.has(node.id));
  }
}
