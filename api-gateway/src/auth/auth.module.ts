import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';

@Module({
  controllers: [AuthController, JwksController],
})
export class AuthModule {}


