import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { setupWsProxy } from './ws/ws-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
  );

  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  app.getHttpAdapter().getInstance().get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return reply.send(await registry.metrics());
  });

  const config = new DocumentBuilder()
    .setTitle('EnginEdge API Gateway')
    .setDescription('Gateway API')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  await app.listen({ port, host: '0.0.0.0' });
  const httpServer = app.getHttpAdapter().getHttpServer();
  setupWsProxy(httpServer);
}

bootstrap();


