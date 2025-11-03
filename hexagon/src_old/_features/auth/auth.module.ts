import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from '../../core/infrastructure/auth/jwt.strategy';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    CoreServicesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT secret is not configured. Please set the JWT_SECRET environment variable.',
          );
        }
        return {
          secret,
          signOptions: { expiresIn: '1d' },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
