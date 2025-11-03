import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { IdentityClientService } from './identity-client.service';

@Module({
  controllers: [AuthController, JwksController],
  providers: [IdentityClientService],
})
export class AuthModule {}
