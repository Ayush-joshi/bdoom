import * as crypto from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { getConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { SafeUser, SessionRecord, toSafeUser } from '../types';
import { UsersService } from '../users/users.service';

interface LoginAttempt {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, LoginAttempt>();

  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
  ) {}

  async login(
    username: string,
    password: string,
    rateLimitKey: string,
  ): Promise<{ user: SafeUser; token: string; expiresAt: Date }> {
    this.checkRateLimit(rateLimitKey);

    const user = await this.users.findByUsername(username);
    const passwordOk = user ? await this.users.verifyPassword(user, password) : false;

    if (!user || !passwordOk) {
      this.recordFailedAttempt(rateLimitKey);
      throw new UnauthorizedException('Invalid username or password');
    }

    this.attempts.delete(rateLimitKey);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = this.getSessionExpiry();

    await this.db.run(
      'INSERT INTO sessions (userId, tokenHash, expiresAt) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt.toISOString()],
    );

    return { user: toSafeUser(user), token, expiresAt };
  }

  async logout(sessionId: number): Promise<void> {
    await this.db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    currentSessionId: number,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    const passwordOk = user
      ? await this.users.verifyPassword(user, currentPassword)
      : false;

    if (!user || !passwordOk) {
      throw new ForbiddenException('Current password is incorrect');
    }

    await this.users.updatePassword(userId, newPassword);
    await this.db.run('DELETE FROM sessions WHERE userId = ? AND id <> ?', [
      userId,
      currentSessionId,
    ]);
  }

  async clearUserSessions(userId: number): Promise<void> {
    await this.db.run('DELETE FROM sessions WHERE userId = ?', [userId]);
  }

  async authenticateToken(token: string | undefined): Promise<
    | {
        user: SafeUser;
        session: SessionRecord;
      }
    | undefined
  > {
    if (!token) {
      return undefined;
    }

    const tokenHash = this.hashToken(token);
    const session = await this.db.get<SessionRecord>(
      'SELECT * FROM sessions WHERE tokenHash = ?',
      [tokenHash],
    );

    if (!session) {
      return undefined;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.logout(session.id);
      return undefined;
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      await this.logout(session.id);
      return undefined;
    }

    return { user: toSafeUser(user), session };
  }

  getCookieOptions(expiresAt?: Date) {
    const config = getConfig();
    return {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax' as const,
      path: '/',
      expires: expiresAt,
    };
  }

  private getSessionExpiry(): Date {
    const config = getConfig();
    return new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private checkRateLimit(key: string): void {
    const attempt = this.attempts.get(key);
    if (!attempt) {
      return;
    }
    if (attempt.resetAt <= Date.now()) {
      this.attempts.delete(key);
      return;
    }
    if (attempt.count >= 10) {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordFailedAttempt(key: string): void {
    const now = Date.now();
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return;
    }
    current.count += 1;
  }
}
