import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Registry } from 'prom-client';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { setupWsProxy } from './infrastructure/ws/ws-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  // Get the Prometheus registry from the MetricsModule
  const registry = app.get<Registry>('PrometheusRegistry');
  app
    .getHttpAdapter()
    .getInstance()
    .get('/metrics', async (_req, reply) => {
      reply.header('Content-Type', registry.contentType);
      return reply.send(await registry.metrics());
    });

  const config = new DocumentBuilder()
    .setTitle('EnginEdge Hexagon')
    .setDescription('Orchestration and API Gateway for EnginEdge Platform')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'jwt',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen({ port, host: '0.0.0.0' });
  const httpServer = app.getHttpAdapter().getHttpServer();
  setupWsProxy(httpServer);

  console.log(`Hexagon running on port ${port}`);
}

bootstrap();
