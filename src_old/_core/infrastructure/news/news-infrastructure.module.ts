import { Module } from '@nestjs/common';
import { NewsInfrastructureService } from './services/news-infrastructure.service';
import { DataLakeModule } from '../datalake';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [DataLakeModule, CoreServicesModule],
  providers: [NewsInfrastructureService],
  exports: [NewsInfrastructureService],
})
export class NewsInfrastructureModule {}
