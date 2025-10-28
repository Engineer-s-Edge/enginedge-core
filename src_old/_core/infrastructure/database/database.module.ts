import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import databaseConfig from '../../config/database.config';
import { MyLogger } from '../../services/logger/logger.service';
import { getErrorInfo } from '../../../common/error-assertions';
import { CoreServicesModule } from '../../services/core-services.module';

@Module({
  imports: [
    CoreServicesModule,
    ConfigModule.forFeature(databaseConfig),
    MongooseModule.forRootAsync({
      imports: [ConfigModule.forFeature(databaseConfig), CoreServicesModule],
      useFactory: async (configService: ConfigService, logger: MyLogger) => {
        const dbConfig = configService.get('database');

        logger.info('Initializing database connection', DatabaseModule.name);

        // If in-memory mode is enabled, start the server and get the URI
        if (dbConfig.useInMemory) {
          logger.info(
            'Starting in-memory MongoDB server...',
            DatabaseModule.name,
          );
          const mongoMemoryServer = await MongoMemoryServer.create({
            instance: {
              dbName: 'enginedge-main-node-in-memory',
              port: 27018, // Use a fixed port for consistent access
            },
          });

          const mongoUri = mongoMemoryServer.getUri();
          // Append the database name to the URI to ensure it uses the correct database
          const mongoUriWithDb = `${mongoUri}enginedge-main-node-in-memory`;
          logger.info(
            `In-memory MongoDB server started at: ${mongoUriWithDb}`,
            DatabaseModule.name,
          );

          // Store the server instance globally so we can stop it later
          (global as any).__mongoMemoryServer = mongoMemoryServer;

          return {
            uri: mongoUriWithDb,
            ...dbConfig.options,
          };
        }

        // Regular MongoDB connection
        logger.info(
          `Connecting to MongoDB at: ${dbConfig.uri}`,
          DatabaseModule.name,
        );
        return {
          uri: dbConfig.uri,
          ...dbConfig.options,
        };
      },
      inject: [ConfigService, MyLogger],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(private readonly logger: MyLogger) {}

  async onModuleDestroy() {
    const mongoMemoryServer = (global as any).__mongoMemoryServer;
    if (mongoMemoryServer) {
      try {
        this.logger.info(
          'Stopping in-memory MongoDB server...',
          DatabaseModule.name,
        );
        await mongoMemoryServer.stop();
        this.logger.info(
          'In-memory MongoDB server stopped',
          DatabaseModule.name,
        );
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Error stopping in-memory MongoDB server: ${info.message}\n${info.stack || ''}`,
          DatabaseModule.name,
        );
        // Try to force cleanup if normal stop fails
        try {
          await mongoMemoryServer.cleanup();
          this.logger.info(
            'Forced cleanup of in-memory MongoDB server',
            DatabaseModule.name,
          );
        } catch (cleanupError) {
          const cleanupInfo = getErrorInfo(cleanupError);
          this.logger.error(
            `Error during forced cleanup: ${cleanupInfo.message}\n${cleanupInfo.stack || ''}`,
            DatabaseModule.name,
          );
        }
      } finally {
        (global as any).__mongoMemoryServer = null;
      }
    }
  }
}
