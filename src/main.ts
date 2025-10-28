// Better stack traces
require('trace');
require('clarify');
Error.stackTraceLimit = 100;

// Set max listeners to prevent memory leak warnings
process.setMaxListeners(20);

// Silence KafkaJS partitioner warning
process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

// Suppress punycode deprecation warning
const originalEmitWarning = process.emitWarning.bind(process);
const patchedEmitWarning: typeof process.emitWarning = (
  warning: any,
  a?: any,
  b?: any,
  c?: any,
) => {
  // Check if this is a punycode deprecation warning
  if (typeof warning === 'string' && warning.includes('punycode')) {
    return; // Suppress punycode deprecation warnings
  }
  // Check if it's the specific DEP0040 warning
  const name: string | undefined = typeof a === 'string' ? a : undefined;
  const code: string | undefined = typeof b === 'string' ? b : undefined;
  if (name === 'DeprecationWarning' && code === 'DEP0040') {
    return; // Suppress punycode deprecation warnings
  }
  return originalEmitWarning(warning as any, a as any, b as any, c as any);
};
// Assign patched function

(process as any).emitWarning = patchedEmitWarning as any;

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  // CORS must be enabled before CSRF middleware so preflight/errors include CORS headers
  app.enableCors({
    origin: ['http://localhost:9090', process.env.FRONTEND_ORIGIN || ''].filter(
      Boolean,
    ),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 86400,
  });

  app.use(cookieParser());
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);

  // Handle termination signals
  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`${signal} signal received: closing HTTP server`);

      try {
        await app.close();
        console.log(`HTTP server closed`);
      } catch (error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        console.error(`Error during app shutdown:`, e.stack);
      }

      // Clean up MongoDB memory server if it exists
      const mongoMemoryServer = (global as any).__mongoMemoryServer;
      if (mongoMemoryServer) {
        try {
          console.log(`Cleaning up in-memory MongoDB server...`);
          await mongoMemoryServer.stop();
          console.log(`In-memory MongoDB server cleaned up`);
        } catch (error: unknown) {
          const e = error instanceof Error ? error : new Error(String(error));
          console.error(`Error cleaning up MongoDB memory server:`, e.stack);
        }
      }

      process.exit(0);
    });
  });
}
bootstrap();
