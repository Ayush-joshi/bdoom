export type UserRole = 'admin' | 'brother';

export interface UserRecord {
  id: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface SafeUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface SessionRecord {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthenticatedRequest extends Express.Request {
  user?: SafeUser;
  session?: SessionRecord;
}

export function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}
