import { Module } from '@nestjs/common';
import { WolframService } from './wolfram.service';
import { CoreServicesModule } from '../../services/core-services.module';
import { LocalWolframService } from './local-kernel/local-wolfram.service';
import { WebWolframService } from './web/web-wolfram.service';

@Module({
  imports: [CoreServicesModule],
  providers: [WolframService, LocalWolframService, WebWolframService],
  exports: [WolframService],
})
export class WolframModule {}
