import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';

describe('BDoom API', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `bdoom-test-${Date.now()}-${Math.random()}.sqlite`);
    process.env.NODE_ENV = 'test';
    process.env.BDOOM_DB_PATH = dbPath;
    process.env.COOKIE_SECURE = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    db = moduleRef.get(DatabaseService);
  });

  afterEach(async () => {
    await app.close();
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath);
    }
  });

  it('returns health', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('ok');
        expect(response.body.timestamp).toBeDefined();
      });
  });

  it('fails login with wrong password', async () => {
    await seedUser('admin', 'secret');

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toBe('Invalid username or password');
      });
  });

  it('allows a seeded user to login', async () => {
    await seedUser('admin', 'secret');

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(201)
      .expect('set-cookie', /bdoom_session/)
      .expect((response) => {
        expect(response.body).toEqual({
          id: expect.any(Number),
          username: 'admin',
          role: 'admin',
        });
        expect(response.body.passwordHash).toBeUndefined();
      });
  });

  it('requires a session for /api/auth/me', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  async function seedUser(username: string, password: string): Promise<void> {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await db.run('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)', [
      username,
      passwordHash,
      'admin',
    ]);
  }
});
