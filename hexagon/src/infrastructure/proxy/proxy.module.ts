import { Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { AssistantProxyController } from './assistant.controller';
import {
  SchedulingProxyController,
  CalendarProxyController,
} from './scheduling.controller';
import { ResumeProxyController } from './resume.controller';
import { InterviewProxyController } from './interview.controller';
import { DataProxyController } from './data.controller';
import { LatexProxyController } from './latex.controller';
import { ToolsProxyController } from './tools.controller';

@Module({
  controllers: [
    AssistantProxyController,
    SchedulingProxyController,
    CalendarProxyController,
    ResumeProxyController,
    InterviewProxyController,
    DataProxyController,
    LatexProxyController,
    ToolsProxyController,
  ],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
