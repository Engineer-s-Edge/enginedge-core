export interface IKafkaProducer {
  publish(topic: string, message: any): Promise<void>;
}
