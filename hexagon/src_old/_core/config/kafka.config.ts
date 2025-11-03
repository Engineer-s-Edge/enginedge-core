import { registerAs } from '@nestjs/config';

export default registerAs('kafka', () => ({
  topics: {
    calendarEvents:
      process.env.KAFKA_TOPIC_CALENDAR_EVENTS || 'calendar-events',
    mlPipelineTriggers:
      process.env.KAFKA_TOPIC_ML_PIPELINE_TRIGGERS || 'ml-pipeline-triggers',
    calendarPredictions:
      process.env.KAFKA_TOPIC_CALENDAR_PREDICTIONS || 'calendar-predictions',
    userActivity: process.env.KAFKA_TOPIC_USER_ACTIVITY || 'user-activity',
    commands: process.env.KAFKA_TOPIC_COMMANDS || 'commands',
    results: process.env.KAFKA_TOPIC_RESULTS || 'results',
    workerStatus: process.env.KAFKA_TOPIC_WORKER_STATUS || 'worker-status',
  },
}));
