import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @Post('login')
  async login(@Body() credentials: { username: string; password: string }) {
    const user = await this.authService.validateUser(
      credentials.username,
      credentials.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @Post('register')
  async register(@Body() userData: any) {
    return this.authService.register(userData);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    // Transform the JWT payload to match frontend expectations
    // JWT strategy returns: { userId, username, role }
    // Frontend expects: { _id or id, username, email, role }
    return {
      _id: req.user?.userId || req.user?.sub,
      id: req.user?.userId || req.user?.sub,
      username: req.user?.username,
      email: req.user?.email || `${req.user?.username}@enginedge.local`, // Fallback if email not in JWT
      role: req.user?.role || 'user',
    };
  }
}
