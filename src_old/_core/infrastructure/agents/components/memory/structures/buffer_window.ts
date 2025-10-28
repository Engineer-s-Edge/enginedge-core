import {
  AgentMemoryType,
  BufferMemoryMessage,
  BufferWindowMemoryConfig,
  MemoryStructure,
} from '../memory.interface';
import { ConversationBufferMemory } from './buffer';
import { MyLogger } from '@core/services/logger/logger.service';

/*
 * ConversationBufferWindowMemory
 *
 * This class extends the ConversationBufferMemory class to implement a windowed memory structure.
 * It retains only the last k interactions, discarding older messages to keep the memory footprint bounded.
 * It is useful for scenarios where only recent context matters, reducing prompt size and cost for ongoing conversations.
 *
 * The class provides methods to add new messages, resize the memory window, and collapse the buffer to its maximum size.
 */
export class ConversationBufferWindowMemory
  extends ConversationBufferMemory
  implements MemoryStructure
{
  protected maxSize: number;

  constructor(
    private readonly cbwm_config: BufferWindowMemoryConfig,
    logger: MyLogger,
  ) {
    super(
      { ...cbwm_config, type: AgentMemoryType.ConversationBufferMemory },
      logger,
    );
    this.maxSize = this.cbwm_config.maxSize;
    this.logger.info(
      `ConversationBufferWindowMemory initializing with maxSize: ${this.maxSize}`,
      ConversationBufferWindowMemory.name,
    );
  }

  set load(buffer: BufferMemoryMessage[]) {
    this.logger.info(
      `Loading buffer window with ${buffer.length} messages`,
      ConversationBufferWindowMemory.name,
    );
    this.buffer = buffer;
    this.collapse();
  }

  public getMaxSize(): number {
    this.logger.info(
      `Getting max size: ${this.maxSize}`,
      ConversationBufferWindowMemory.name,
    );
    return this.maxSize;
  }

  override concat(
    ...items: ConcatArray<BufferMemoryMessage>[]
  ): BufferMemoryMessage[] {
    this.buffer = super.concat(...items);
    return this.collapse();
  }

  override push(...items: BufferMemoryMessage[]): number {
    const result = super.push(...items);
    this.collapse();
    return result;
  }

  override fill(
    value: BufferMemoryMessage,
    start?: number,
    end?: number,
  ): this {
    const result = super.fill(value, start, end);
    this.collapse();
    return result;
  }

  override unshift(...items: BufferMemoryMessage[]): number {
    const result = super.unshift(...items);
    this.collapse();
    return result;
  }

  override splice(
    start: number,
    deleteCount?: number,
    ...items: BufferMemoryMessage[]
  ): BufferMemoryMessage[] {
    const result = deleteCount
      ? super.splice(start, deleteCount, ...items)
      : super.splice(start, 0, ...items);
    this.collapse();
    return result;
  }

  addMessage(message: BufferMemoryMessage): void {
    this.logger.info(
      `Adding message from ${message.sender} to buffer window`,
      ConversationBufferWindowMemory.name,
    );
    this.buffer.push({
      _id: message._id,
      sender: message.sender,
      text: message.text,
    });
    // Trim buffer to maximum size
    const removedCount = this.buffer.length - this.maxSize;
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
    if (removedCount > 0) {
      this.logger.info(
        `Trimmed ${removedCount} messages from buffer window`,
        ConversationBufferWindowMemory.name,
      );
    }
  }

  processMessage(message: BufferMemoryMessage): void {
    this.logger.info(
      'Processing message in buffer window',
      ConversationBufferWindowMemory.name,
    );
    this.collapse();
  }

  resize(newSize: number): void {
    this.logger.info(
      `Resizing buffer window from ${this.maxSize} to ${newSize}`,
      ConversationBufferWindowMemory.name,
    );
    this.maxSize = newSize;
    const removedCount = this.buffer.length - this.maxSize;
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
    if (removedCount > 0) {
      this.logger.info(
        `Removed ${removedCount} messages during resize`,
        ConversationBufferWindowMemory.name,
      );
    }
  }

  collapse(): BufferMemoryMessage[] {
    if (this.buffer.length > this.maxSize) {
      const removedCount = this.buffer.length - this.maxSize;
      this.buffer.splice(0, this.buffer.length - this.maxSize);
      this.logger.info(
        `Collapsed buffer window, removed ${removedCount} messages`,
        ConversationBufferWindowMemory.name,
      );
    }
    return this.buffer;
  }

  kill(): void {
    this.logger.info(
      `Killing buffer window with ${this.buffer.length} messages`,
      ConversationBufferWindowMemory.name,
    );
    this.buffer = [];
    this.maxSize = 0;
  }
}
