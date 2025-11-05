import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { UsersController } from './users.controller';
import { OAuthController } from './oauth.controller';
import { IdentityClientService } from './identity-client.service';
import { JwtService } from './jwt.service';
import { JwtAuthGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';

@Module({
  controllers: [AuthController, JwksController, UsersController, OAuthController],
  providers: [IdentityClientService, JwtService, JwtAuthGuard, RolesGuard],
  exports: [JwtService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
