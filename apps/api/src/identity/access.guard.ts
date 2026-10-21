import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const value = request.headers.authorization;
    if (typeof value !== 'string' || !value.startsWith('Bearer '))
      throw new UnauthorizedException('Authentication is required.');
    const actor = await this.auth.actor(value.slice(7));
    request.actor = actor;
    const token: any = require('jsonwebtoken').decode(value.slice(7));
    request.actor.sessionId = token?.sid;
    return true;
  }
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest().actor,
);
