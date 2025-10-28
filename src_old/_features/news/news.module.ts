import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { DataLakeModule } from '../../core/infrastructure/datalake';
import { NewsInfrastructureModule } from '../../core/infrastructure/news';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [DataLakeModule, NewsInfrastructureModule, CoreServicesModule],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
