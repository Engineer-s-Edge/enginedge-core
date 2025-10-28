import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import axios from 'axios';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

import { MyLogger } from '../../core/services/logger/logger.service';
import { KafkaService } from '../../core/infrastructure/kafka/kafka.service';
import { CalendarActivityModelService } from '../../core/infrastructure/calendar/ml/calendar-activity-model.service';

@Injectable()
export class StartupHealthService implements OnModuleInit {
  constructor(
    private readonly logger: MyLogger,
    private readonly kafkaService: KafkaService,
    private readonly mlService: CalendarActivityModelService,
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  async onModuleInit() {
    // Run asynchronously after Nest has bootstrapped to avoid blocking startup
    setTimeout(() => this.runHealthSweep().catch(() => {}), 0);
  }

  private async runHealthSweep() {
    this.logger.info('Startup health sweep: begin', StartupHealthService.name);

    const checks: Array<Promise<void>> = [];

    // MongoDB
    checks.push(
      (async () => {
        try {
          const state = this.mongoConnection.readyState; // 1 = connected
          if (state === 1) {
            this.logger.info('MongoDB: connected', StartupHealthService.name);
          } else {
            this.logger.warn(
              `MongoDB: not connected (state=${state})`,
              StartupHealthService.name,
            );
          }
        } catch (err) {
          this.logger.error(
            `MongoDB check error: ${(err as Error).message}`,
            (err as Error).stack,
            StartupHealthService.name,
          );
        }
      })(),
    );

    // Kafka
    checks.push(
      (async () => {
        try {
          const status = this.kafkaService.getStatus();
          if (status.enabled && status.connected) {
            this.logger.info('Kafka: connected', StartupHealthService.name);
          } else if (status.enabled && !status.connected) {
            this.logger.warn(
              'Kafka: enabled but not connected',
              StartupHealthService.name,
            );
          } else {
            this.logger.info('Kafka: disabled', StartupHealthService.name);
          }
        } catch (err) {
          this.logger.error(
            `Kafka check error: ${(err as Error).message}`,
            (err as Error).stack,
            StartupHealthService.name,
          );
        }
      })(),
    );

    // MinIO/S3 (quiet reachability probe using ListBuckets)
    checks.push(
      (async () => {
        try {
          const endpoint =
            process.env.S3_ENDPOINT ||
            process.env.MINIO_ENDPOINT ||
            'http://localhost:9000';
          const accessKeyId =
            process.env.S3_ACCESS_KEY_ID ||
            process.env.MINIO_ACCESS_KEY ||
            'minioadmin';
          const secretAccessKey =
            process.env.S3_SECRET_ACCESS_KEY ||
            process.env.MINIO_SECRET_KEY ||
            'minioadmin';
          const s3 = new S3Client({
            endpoint,
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true,
            region: 'us-east-1',
          });
          await s3.send(new ListBucketsCommand({}));
          this.logger.info('S3/MinIO: reachable', StartupHealthService.name);
        } catch (err) {
          this.logger.warn(
            `S3/MinIO not reachable: ${(err as Error).message}`,
            StartupHealthService.name,
          );
        }
      })(),
    );

    // Scheduling Model (with small retry to avoid transient startup warnings)
    checks.push(
      (async () => {
        try {
          const mlBaseUrl =
            process.env.SCHEDULING_MODEL_URL || 'http://scheduling-model:8000';
          let attempt = 0;
          let lastStatus = 'error';
          while (attempt < 3) {
            const res = await this.mlService.checkMlServiceHealth();
            lastStatus = res.status;
            if (res.status === 'ok') break;
            await new Promise((r) => setTimeout(r, 500));
            attempt++;
          }
          if (lastStatus === 'ok') {
            this.logger.info(
              `Scheduling Model: healthy (${mlBaseUrl})`,
              StartupHealthService.name,
            );
          } else {
            this.logger.warn(
              `Scheduling Model: ${lastStatus} (${mlBaseUrl})`,
              StartupHealthService.name,
            );
          }
        } catch (err) {
          this.logger.error(
            `Scheduling Model check error: ${(err as Error).message}`,
            (err as Error).stack,
            StartupHealthService.name,
          );
        }
      })(),
    );

    // Wolfram local kernel /health endpoint (if available)
    checks.push(
      (async () => {
        const wolframUrl =
          process.env.WOLFRAM_LOCAL_URL || 'http://wolfram-kernel:5000';
        try {
          let attempt = 0;
          let res;
          while (attempt < 3) {
            res = await axios.get(`${wolframUrl}/health`, {
              timeout: 3000,
              validateStatus: () => true,
            });
            if (res.status >= 200 && res.status < 300) break;
            await new Promise((r) => setTimeout(r, 500));
            attempt++;
          }
          if (res && res.status >= 200 && res.status < 300) {
            this.logger.info(
              `Wolfram Kernel: healthy (${wolframUrl})`,
              StartupHealthService.name,
            );
          } else if (res) {
            const body =
              typeof res.data === 'object'
                ? JSON.stringify(res.data)
                : String(res.data);
            this.logger.warn(
              `Wolfram Kernel responded ${res.status} at ${wolframUrl}/health: ${body}`,
              StartupHealthService.name,
            );
          }
        } catch (err) {
          this.logger.warn(
            `Wolfram Kernel health request failed at ${wolframUrl}: ${(err as Error).message}`,
            StartupHealthService.name,
          );
        }
      })(),
    );

    await Promise.all(checks);
    this.logger.info(
      'Startup health sweep: complete',
      StartupHealthService.name,
    );
  }
}
