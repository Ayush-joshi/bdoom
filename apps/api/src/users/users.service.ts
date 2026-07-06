import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseService } from '../database/database.service';
import { SafeUser, toSafeUser, UserRecord, UserRole } from '../types';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  findByUsername(username: string): Promise<UserRecord | undefined> {
    return this.db.get<UserRecord>('SELECT * FROM users WHERE username = ?', [username]);
  }

  findById(id: number): Promise<UserRecord | undefined> {
    return this.db.get<UserRecord>('SELECT * FROM users WHERE id = ?', [id]);
  }

  listSafeUsers(): Promise<SafeUser[]> {
    return this.db.all<SafeUser>(
      'SELECT id, username, role FROM users ORDER BY username ASC',
    );
  }

  async createUser(
    username: string,
    password: string,
    role: UserRole,
  ): Promise<SafeUser> {
    const passwordHash = await this.hashPassword(password);
    try {
      const result = await this.db.run(
        'INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)',
        [username, passwordHash, role],
      );
      return {
        id: result.lastID,
        username,
        role,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('SQLITE_CONSTRAINT')) {
        throw new ConflictException('Username already exists');
      }
      throw error;
    }
  }

  async updateRole(userId: number, role: UserRole): Promise<SafeUser> {
    const current = await this.findById(userId);
    if (!current) {
      throw new NotFoundException('User not found');
    }
    if (current.role === 'admin' && role !== 'admin') {
      const adminCount = await this.countAdmins();
      if (adminCount <= 1) {
        throw new BadRequestException('At least one admin is required');
      }
    }

    const result = await this.db.run(
      'UPDATE users SET role = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [role, userId],
    );
    if (result.changes === 0) {
      throw new NotFoundException('User not found');
    }
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toSafeUser(user);
  }

  async updatePassword(userId: number, password: string): Promise<void> {
    const passwordHash = await this.hashPassword(password);
    const result = await this.db.run(
      'UPDATE users SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, userId],
    );
    if (result.changes === 0) {
      throw new NotFoundException('User not found');
    }
  }

  verifyPassword(user: UserRecord, password: string): Promise<boolean> {
    return argon2.verify(user.passwordHash, password);
  }

  private hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private async countAdmins(): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
    );
    return row?.count ?? 0;
  }
}
