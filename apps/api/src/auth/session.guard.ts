import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedRequest } from '../types';
import { AuthService } from './auth.service';

export const SESSION_COOKIE = 'bdoom_session';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & Request>();
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    const auth = await this.auth.authenticateToken(token);

    if (!auth) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = auth.user;
    request.session = auth.session;
    return true;
  }
}
