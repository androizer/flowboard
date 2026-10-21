import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { config } from '../persistence/runtime.config';
import { AccessGuard, CurrentActor } from './access.guard';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

const refreshCookie = 'flowboard_refresh';
function allowedOrigin(origin?: string) {
  return origin === config().webOrigin;
}

@Controller('v1')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefresh(res: Response, token: string, expires: Date) {
    res.cookie(refreshCookie, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: !config().demoMode,
      path: '/v1/auth',
      expires,
    });
  }
  private clearRefresh(res: Response) {
    res.clearCookie(refreshCookie, {
      httpOnly: true,
      sameSite: 'strict',
      secure: !config().demoMode,
      path: '/v1/auth',
    });
  }

  @Post('auth/login') async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.loginIdentifier, dto.password);
    this.setRefresh(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken };
  }
  @Post('auth/refresh') async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin?: string,
  ) {
    if (!allowedOrigin(origin)) throw new ForbiddenException('Refresh origin is not allowed.');
    const token = req.cookies?.[refreshCookie] as string | undefined;
    if (!token) throw new UnauthorizedException('Refresh session is unavailable.');
    try {
      const result = await this.auth.refresh(token);
      this.setRefresh(res, result.refreshToken, result.refreshExpiresAt);
      return { accessToken: result.accessToken };
    } catch (error) {
      this.clearRefresh(res);
      throw error;
    }
  }
  @UseGuards(AccessGuard) @Post('auth/logout') @HttpCode(204) async logout(
    @CurrentActor() actor: { sessionId: string },
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin?: string,
  ) {
    if (!allowedOrigin(origin)) throw new ForbiddenException('Logout origin is not allowed.');
    await this.auth.logout(actor.sessionId);
    this.clearRefresh(res);
  }
  @UseGuards(AccessGuard) @Post('auth/logout-all') @HttpCode(204) async logoutAll(
    @CurrentActor() actor: { userId: string },
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin?: string,
  ) {
    if (!allowedOrigin(origin)) throw new ForbiddenException('Logout origin is not allowed.');
    await this.auth.logoutAll(actor.userId);
    this.clearRefresh(res);
  }
  @UseGuards(AccessGuard) @Get('me') async me(
    @CurrentActor() actor: { userId: string; workspaceId: string; role: 'admin' | 'member' },
  ) {
    return this.auth.currentUser(actor);
  }
  @UseGuards(AccessGuard) @Get('users') users(
    @CurrentActor() actor: { workspaceId: string },
    @Query('offset') rawOffset?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const offset = rawOffset === undefined ? 0 : Number(rawOffset);
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('Invalid pagination.');
    return this.auth.members(actor.workspaceId, offset, limit);
  }
}
