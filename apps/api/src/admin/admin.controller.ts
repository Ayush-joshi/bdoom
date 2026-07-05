import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { UsersService } from '../users/users.service';

@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  usersList() {
    return this.users.listSafeUsers();
  }
}
