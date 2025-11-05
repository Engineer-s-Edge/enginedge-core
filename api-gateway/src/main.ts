import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { KafkaLoggerService } from './infrastructure/logging/kafka-logger.service';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true })
  );
  // Use Kafka-backed logger
  app.useLogger(app.get(KafkaLoggerService));

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true })
  );

  // metrics endpoint is served by MetricsModule controller

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
  // ws-proxy is initialized by WsProxyModule on module init
}

bootstrap();
