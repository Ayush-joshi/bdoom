import * as path from 'node:path';

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  dbPath: string;
  cookieSecure: boolean;
  sessionDays: number;
  radioRelayEnabled: boolean;
  radioRelayMaxListeners: number;
}

export function getConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const dbPath =
    process.env.BDOOM_DB_PATH ??
    (nodeEnv === 'test'
      ? path.join(process.cwd(), 'test-bdoom.sqlite')
      : '/opt/bdoom/data/bdoom.sqlite');

  return {
    nodeEnv,
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3000),
    dbPath,
    cookieSecure:
      (process.env.COOKIE_SECURE ?? (nodeEnv === 'production' ? 'true' : 'false')) ===
      'true',
    sessionDays: Number(process.env.SESSION_DAYS ?? 7),
    radioRelayEnabled: (process.env.RADIO_RELAY_ENABLED ?? 'true') === 'true',
    radioRelayMaxListeners: Number(process.env.RADIO_RELAY_MAX_LISTENERS ?? 50),
  };
}
