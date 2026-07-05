import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SafeUser, UserRecord } from '../types';

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
}
