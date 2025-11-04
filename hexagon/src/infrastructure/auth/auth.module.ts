import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { UsersController } from './users.controller';
import { OAuthController } from './oauth.controller';
import { IdentityClientService } from './identity-client.service';
import { JwtService } from './jwt.service';

@Module({
  controllers: [AuthController, JwksController, UsersController, OAuthController],
  providers: [IdentityClientService, JwtService],
  exports: [JwtService],
})
export class AuthModule {}

