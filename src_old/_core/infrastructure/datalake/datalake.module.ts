import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3StorageService } from './services/s3-storage.service';
import { DataLakeService } from './services/data-lake.service';
import { DataLakeConfig } from './types';
import { CoreServicesModule } from '@core/services/core-services.module';
import { MyLogger } from '@core/services/logger/logger.service';

@Module({
  imports: [CoreServicesModule],
  providers: [
    {
      provide: S3StorageService,
      useFactory: (logger: MyLogger, configService: ConfigService) => {
        const config: DataLakeConfig = {
          endpoint:
            configService.get<string>('urls.minioEndpoint') ??
            (process.env.MINIO_ENDPOINT || 'http://localhost:9000'),
          accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
          secretAccessKey:
            (process.env.MINIO_SECRET_KEY as string) ?? 'minioadmin',
          region: 'us-east-1',
          forcePathStyle: true,
        };
        return new S3StorageService(logger, config);
      },
      inject: [MyLogger, ConfigService],
    },
    DataLakeService,
  ],
  exports: [S3StorageService, DataLakeService],
})
export class DataLakeModule {}
