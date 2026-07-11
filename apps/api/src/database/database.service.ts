import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import sqlite3 = require('sqlite3');
import { getConfig } from '../config';

type SqlParams = Array<string | number | null>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: sqlite3.Database;

  async onModuleInit(): Promise<void> {
    const config = getConfig();
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    this.db = new sqlite3.Database(config.dbPath);
    await this.exec('PRAGMA foreign_keys = ON');
    await this.exec('PRAGMA journal_mode = WAL');
    await this.migrate();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.db) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.db.close((error) => (error ? reject(error) : resolve()));
    });
  }

  run(sql: string, params: SqlParams = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(error) {
        if (error) {
          reject(error);
          return;
        }
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get<T>(sql: string, params: SqlParams = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row as T | undefined);
      });
    });
  }

  all<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows as T[]);
      });
    });
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (error) => (error ? reject(error) : resolve()));
    });
  }

  private async migrate(): Promise<void> {
    await this.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(tokenHash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(userId);
    `);

    try {
      const cols = await this.all<{ name: string }>("PRAGMA table_info(radio_stations)");
      const hasSource = cols.some((c) => c.name === 'source');
      if (cols.length > 0 && !hasSource) {
        await this.exec('DROP TABLE radio_stations');
      }
    } catch {
      // Ignore if table check fails
    }

    await this.exec(`
      CREATE TABLE IF NOT EXISTS radio_stations (
        stationuuid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        url_resolved TEXT NOT NULL,
        homepage TEXT,
        favicon TEXT,
        country TEXT,
        countrycode TEXT,
        state TEXT,
        language TEXT,
        tags TEXT,
        codec TEXT,
        bitrate INTEGER,
        hls INTEGER,
        lastcheckok INTEGER,
        geo_lat REAL NOT NULL,
        geo_long REAL NOT NULL,
        source TEXT NOT NULL,
        source_references TEXT NOT NULL,
        alternative_urls TEXT NOT NULL,
        recent_success INTEGER NOT NULL DEFAULT 0,
        recent_failures INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
}
