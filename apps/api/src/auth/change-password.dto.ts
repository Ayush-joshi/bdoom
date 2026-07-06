import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(1, 256)
  currentPassword!: string;

  @IsString()
  @Length(12, 256)
  newPassword!: string;
}
