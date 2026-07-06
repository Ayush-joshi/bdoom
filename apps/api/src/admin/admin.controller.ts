import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AdminGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  CreateUserDto,
  UpdateUserPasswordDto,
  UpdateUserRoleDto,
} from '../users/user.dto';
import { UsersService } from '../users/users.service';

@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Get('users')
  usersList() {
    return this.users.listSafeUsers();
  }

  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    return this.users.createUser(body.username, body.password, body.role);
  }

  @Patch('users/:id/role')
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserRoleDto,
  ) {
    return this.users.updateRole(id, body.role);
  }

  @Patch('users/:id/password')
  async updatePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserPasswordDto,
  ) {
    await this.users.updatePassword(id, body.password);
    await this.auth.clearUserSessions(id);
    return { ok: true };
  }
}
