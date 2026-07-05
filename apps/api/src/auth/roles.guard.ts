import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest, UserRole } from '../types';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}

export function hasRole(userRole: UserRole | undefined, required: UserRole): boolean {
  return userRole === required;
}
