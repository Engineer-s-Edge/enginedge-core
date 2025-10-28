import {
  BufferMemoryConfig,
  BufferMemoryMessage,
  MemoryStructure,
} from '../memory.interface';
import { MyLogger } from '@core/services/logger/logger.service';

/*
 * ConversationBufferMemory
 *
 * This class implements a simple memory structure for storing conversation messages.
 * It is designed to be used in scenarios where the entire conversation history needs to be retained
 * without any additional processing or chunking.
 *
 * The class provides methods to add new messages, retrieve all stored messages, and clear the memory.
 * It is suitable for use cases where the conversation history is relatively short and token limits
 * are not a concern.
 */
export class ConversationBufferMemory
  extends Array<BufferMemoryMessage>
  implements MemoryStructure
{
  protected buffer: BufferMemoryMessage[] = [];
  protected readonly maxSize: number = Infinity;
  constructor(
    private readonly cbm_config: BufferMemoryConfig,
    protected readonly logger: MyLogger,
  ) {
    super();
    this.logger.info(
      'ConversationBufferMemory initializing',
      ConversationBufferMemory.name,
    );
  }

  public set load(buffer: BufferMemoryMessage[]) {
    this.logger.info(
      `Loading buffer with ${buffer.length} messages`,
      ConversationBufferMemory.name,
    );
    this.buffer = buffer;
  }

  public addMessage(message: BufferMemoryMessage) {
    this.logger.info(
      `Adding message from ${message.sender} (${message.text.length} characters)`,
      ConversationBufferMemory.name,
    );
    this.buffer.push({
      _id: message._id,
      sender: message.sender,
      text: message.text,
    });
    this.logger.info(
      `Buffer now contains ${this.buffer.length} messages`,
      ConversationBufferMemory.name,
    );
  }

  public processMessage(message: BufferMemoryMessage): void {
    this.logger.info(
      'Processing message (no processing needed for buffer memory)',
      ConversationBufferMemory.name,
    );
    // No processing needed for buffer memory
  }

  /** Retrieve all stored memory messages */
  public getMessages(): BufferMemoryMessage[] {
    this.logger.info(
      `Retrieving ${this.buffer.length} messages from buffer`,
      ConversationBufferMemory.name,
    );
    return [...this.buffer];
  }

  /** Clear the memory buffer */
  public clear(): void {
    this.logger.info(
      `Clearing buffer with ${this.buffer.length} messages`,
      ConversationBufferMemory.name,
    );
    this.buffer = [];
  }
}
