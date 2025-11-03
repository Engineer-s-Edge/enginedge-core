import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IdentityClientService } from './identity-client.service';

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
  @HttpCode(HttpStatus.OK)
  profile() {
    return { status: 'ok' };
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


