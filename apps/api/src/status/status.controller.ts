import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';

@Controller('status')
export class StatusController {
  @Get('home-server')
  @UseGuards(SessionGuard)
  homeServer() {
    return {
      status: 'not_configured',
      message: 'Home Ubuntu tunnel is not configured yet',
    };
  }
}
