import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { IdentityClientService } from './identity-client.service';
import { JwtAuthGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly identity: IdentityClientService) {}
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: any) {
    return this.identity.login(body.email, body.password);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: any) {
    return this.identity.register(body);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async profile(@Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in token');
    }
    return this.identity.profile(userId);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: any) {
    return this.identity.refresh(body.refreshToken);
  }

  @Post('token/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Body() body: any) {
    return this.identity.revoke(body.refreshToken);
  }
}

