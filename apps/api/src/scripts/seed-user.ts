import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import sqlite3 = require('sqlite3');
import { getConfig } from '../config';
import { UserRole } from '../types';

interface Args {
  role: UserRole;
  username?: string;
  password?: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { role: 'brother', force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--role') {
      args.role = argv[++i] as UserRole;
    } else if (item === '--username') {
      args.username = argv[++i];
    } else if (item === '--password') {
      args.password = argv[++i];
    } else if (item === '--force') {
      args.force = true;
    }
  }
  return args;
}

function run(
  db: sqlite3.Database,
  sql: string,
  params: Array<string | number> = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (error) => (error ? reject(error) : resolve()));
  });
}

function get<T>(
  db: sqlite3.Database,
  sql: string,
  params: Array<string | number> = [],
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row as T | undefined);
    });
  });
}

async function migrate(db: sqlite3.Database): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.exec(
      `
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'brother')),
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          tokenHash TEXT NOT NULL UNIQUE,
          expiresAt TEXT NOT NULL,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
        );
      `,
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.username || !args.password) {
    throw new Error('Usage: --username <username> --password <password> [--force]');
  }
  if (args.role !== 'admin' && args.role !== 'brother') {
    throw new Error('Role must be admin or brother');
  }

  const config = getConfig();
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new sqlite3.Database(config.dbPath);

  try {
    await migrate(db);
    const existing = await get<{ id: number }>(
      db,
      'SELECT id FROM users WHERE username = ?',
      [args.username],
    );

    if (existing && !args.force) {
      console.log('User already exists. Use --force to replace role and password hash.');
      return;
    }

    const passwordHash = await argon2.hash(args.password, { type: argon2.argon2id });
    if (existing) {
      await run(
        db,
        'UPDATE users SET passwordHash = ?, role = ?, updatedAt = CURRENT_TIMESTAMP WHERE username = ?',
        [passwordHash, args.role, args.username],
      );
      console.log('User updated.');
      return;
    }

    await run(db, 'INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)', [
      args.username,
      passwordHash,
      args.role,
    ]);
    console.log('User created.');
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
});
