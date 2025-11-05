export interface IKafkaConsumer {
  subscribe(
    topic: string,
    handler: (message: any) => Promise<void>,
  ): Promise<void>;
}
