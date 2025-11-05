import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get<string>('REDIS_URL') || 'redis://localhost:6379/0';
        const keyPrefix =
          configService.get<string>('REDIS_KEY_PREFIX') || 'hexagon:';
        return new Redis(redisUrl, {
          keyPrefix,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
