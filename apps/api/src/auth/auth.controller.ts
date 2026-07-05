import {
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { SESSION_COOKIE, SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Ip() ip: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rateLimitKey = `${ip}:${body.username.toLowerCase()}`;
    const result = await this.auth.login(body.username, body.password, rateLimitKey);
    response.cookie(
      SESSION_COOKIE,
      result.token,
      this.auth.getCookieOptions(result.expiresAt),
    );
    return result.user;
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.session!.id);
    response.clearCookie(SESSION_COOKIE, this.auth.getCookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }
}
