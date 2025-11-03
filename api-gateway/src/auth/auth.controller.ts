import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  login(@Body() _body: any) {
    return { message: 'Not implemented yet' };
  }

  @Post('register')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  register(@Body() _body: any) {
    return { message: 'Not implemented yet' };
  }

  @Get('profile')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  profile() {
    return { message: 'Not implemented yet' };
  }
}


