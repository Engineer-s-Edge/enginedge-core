export interface IKafkaConsumer {
  subscribe(topic: string, handler: (message: any) => Promise<void>): Promise<void>;

  /**
   * Start the consumer to begin processing messages.
   * This should be called after all topics have been subscribed to.
   */
  startConsumer(): Promise<void>;
}
