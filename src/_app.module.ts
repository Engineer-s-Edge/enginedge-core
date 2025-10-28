import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import llmConfig from './core/config/llm.config';
import assistantsConfig from './core/config/assistants.config';
import kafkaConfig from './core/config/kafka.config';
import schedulingConfig from './core/config/scheduling.config';
import urlsConfig from './core/config/urls.config';
import servicesConfig from './core/infrastructure/config/services.config';

import * as core from './core';
import * as features from './features';
import { HabitsGoalsApiModule } from './features/habits-goals-api/habits-goals-api.module';
import { NewsModule } from './features/news/news.module';
import { ConversationsModule } from './features/conversations/conversations.module';
import { CoreServicesModule } from './core/services/core-services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        servicesConfig,
        llmConfig,
        assistantsConfig,
        kafkaConfig,
        schedulingConfig,
        urlsConfig,
      ],
    }),
    CoreServicesModule,
    core.DatabaseModule,
    features.users.UsersModule,
    features.health.HealthModule,
    features.auth.AuthModule,
    core.KubernetesModule.forRoot(),
    core.GoogleCalendarModule,
    core.WolframModule,
    core.LLMModule.register(),
    core.AgentModule.forRoot(),
    core.KafkaModule,
    features.assistants.AssistantsModule,
    ConversationsModule,
    HabitsGoalsApiModule,
    NewsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
