import { Message } from '../../domain/entities/message';
import { IMessagePublisher } from '../../application/ports/interfaces';

export class ConsoleMessagePublisher implements IMessagePublisher {
  private responseHandlers: ((message: Message) => void)[] = [];

  async publish(message: Message): Promise<void> {
    console.log('Publishing message:', message.toJSON());
    // In a real implementation, this would send to Kafka, Redis, etc.
  }

  async publishToWorker(workerId: string, message: Message): Promise<void> {
    console.log(`Publishing message to worker ${workerId}:`, message.toJSON());
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  subscribeToResponses(handler: (message: Message) => void): void {
    this.responseHandlers.push(handler);
  }

  // Method to simulate receiving a response (for testing)
  simulateResponse(message: Message): void {
    this.responseHandlers.forEach((handler) => handler(message));
  }
}
