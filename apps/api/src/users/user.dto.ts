import { IsIn, IsString, Length, Matches } from 'class-validator';
import { UserRole } from '../types';

export class CreateUserDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  username!: string;

  @IsString()
  @Length(12, 256)
  password!: string;

  @IsIn(['admin', 'brother'])
  role!: UserRole;
}

export class UpdateUserRoleDto {
  @IsIn(['admin', 'brother'])
  role!: UserRole;
}

export class UpdateUserPasswordDto {
  @IsString()
  @Length(12, 256)
  password!: string;
}
