import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  username!: string;

  @IsString()
  @Length(1, 256)
  password!: string;
}
