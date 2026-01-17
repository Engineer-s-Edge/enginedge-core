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
        const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379/0';
        const keyPrefix = configService.get<string>('REDIS_KEY_PREFIX') || 'hexagon:';

        let reconnectInterval: NodeJS.Timeout | null = null;
        let isConnected = false;
        const reconnectIntervalMs = 5000; // Check every 5 seconds

        const redisClient = new Redis(redisUrl, {
          keyPrefix,
          retryStrategy: (times) => {
            // Return null to stop automatic retries (we'll handle it manually)
            return null;
          },
          // Disable offline queue to prevent command accumulation when disconnected
          enableOfflineQueue: false,
          // Use lazy connect to prevent immediate connection attempts
          lazyConnect: true,
        });

        // Handle successful connection
        redisClient.on('connect', () => {
          if (!isConnected) {
            console.log('[Redis] Connected successfully');
            isConnected = true;
            // Clear any reconnect interval since we're connected
            if (reconnectInterval) {
              clearInterval(reconnectInterval);
              reconnectInterval = null;
            }
          }
        });

        // Handle disconnection
        redisClient.on('close', () => {
          if (isConnected) {
            console.log('[Redis] Connection closed - will attempt to reconnect');
            isConnected = false;
            startReconnectAttempts();
          }
        });

        // Handle errors gracefully to prevent log spam
        redisClient.on('error', (err: Error | AggregateError) => {
          // Check for connection refused errors (Redis not available)
          const errorMessage = err.message || '';
          const errorString = String(err);
          const isConnectionRefused =
            errorMessage.includes('ECONNREFUSED') ||
            errorString.includes('ECONNREFUSED') ||
            (err instanceof AggregateError &&
              err.errors?.some(
                (e: any) =>
                  String(e).includes('ECONNREFUSED') || e.message?.includes('ECONNREFUSED')
              ));

          if (isConnectionRefused) {
            // Connection refused - Redis is likely not running
            // Silently handle this (no logging to prevent spam)
            if (isConnected) {
              isConnected = false;
            }
            // Start periodic reconnection attempts if not already started
            if (!reconnectInterval) {
              startReconnectAttempts();
            }
            return;
          }
          // Log other errors that might be important (but only once per error type)
          console.warn('[Redis] Connection error:', errorMessage || errorString);
        });

        // Function to start periodic reconnection attempts
        const startReconnectAttempts = () => {
          if (reconnectInterval) {
            return; // Already attempting reconnection
          }

          reconnectInterval = setInterval(async () => {
            if (isConnected) {
              // Already connected, clear interval
              if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
              }
              return;
            }

            try {
              // Attempt to reconnect
              await redisClient.connect();
            } catch (error) {
              // Connection failed, will retry on next interval
              // Error is already handled by the error event handler
            }
          }, reconnectIntervalMs);
        };

        // Initial connection attempt
        redisClient.connect().catch(() => {
          // Connection failed - start periodic reconnection attempts
          startReconnectAttempts();
        });

        return redisClient;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
