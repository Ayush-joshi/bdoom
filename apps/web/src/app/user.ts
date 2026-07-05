export type UserRole = 'admin' | 'brother';

export interface User {
  id: number;
  username: string;
  role: UserRole;
}
