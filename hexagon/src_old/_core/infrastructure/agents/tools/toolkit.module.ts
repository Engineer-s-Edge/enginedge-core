import { Module, DynamicModule, Provider, Scope } from '@nestjs/common';
import { Toolkit } from './toolkit.service';
import { MyLogger } from '../../../services/logger/logger.service';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({})
export class ToolkitModule {
  static register(options: { onUserApproval: any }): DynamicModule {
    const providers: Provider[] = [
      {
        provide: Toolkit,
        useFactory: (logger: MyLogger) =>
          new Toolkit(options.onUserApproval, logger),
        inject: [MyLogger],
        scope: Scope.TRANSIENT,
      },
    ];

    return {
      module: ToolkitModule,
      imports: [CoreServicesModule],
      providers,
      exports: [Toolkit],
    };
  }
}
