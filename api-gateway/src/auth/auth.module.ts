import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { UsersController } from './users.controller';
import { OAuthController } from './oauth.controller';
import { IdentityClientService } from './identity-client.service';

@Module({
  controllers: [AuthController, JwksController, UsersController, OAuthController],
  providers: [IdentityClientService],
})
export class AuthModule {}
