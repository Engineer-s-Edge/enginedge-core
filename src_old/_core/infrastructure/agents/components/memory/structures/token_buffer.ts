import { ConversationBufferMemory } from './buffer';
import {
  AgentMemoryType,
  TokenBufferMemoryConfig,
  BufferMemoryMessage,
  MemoryStructure,
} from '../memory.interface';
import { Inject } from '@nestjs/common';
import { LLMService } from '../../llm';
import { MyLogger } from '@core/services/logger/logger.service';

/*
 * ConversationTokenBufferMemory
 *
 * This class extends the ConversationBufferMemory class to implement a token-limited memory structure.
 * It retains interactions until a maximum token limit is reached, then removes older messages based
 * on token count. This approach allows precise control over context size and is optimal when token
 * budgets must be strictly managed.
 *
 * The class provides methods to add new messages, adjust the maximum token limit, and calculate the
 * current token count of the memory buffer.
 */
export class ConversationTokenBufferMemory
  extends ConversationBufferMemory
  implements MemoryStructure
{
  protected maxTokens: number;
  protected currentTokens: number = 0;

  constructor(
    private readonly ctbm_config: TokenBufferMemoryConfig,
    @Inject(LLMService) private readonly llm: LLMService,
    logger: MyLogger,
  ) {
    super(
      { ...ctbm_config, type: AgentMemoryType.ConversationBufferMemory },
      logger,
    );
    this.maxTokens = this.ctbm_config.maxTokenLimit;
    this.logger.info(
      `ConversationTokenBufferMemory initializing with maxTokens: ${this.maxTokens}`,
      ConversationTokenBufferMemory.name,
    );
  }

  /**
   * Add a message to the buffer and manage token limits
   */
  public addMessage(message: BufferMemoryMessage): void {
    const messageTokens = this.countMessageTokens(message);
    this.logger.info(
      `Adding message from ${message.sender} (${messageTokens} tokens)`,
      ConversationTokenBufferMemory.name,
    );
    this.buffer.push(message);
    this.currentTokens += messageTokens;

    // Remove oldest messages if we exceed the token limit
    this.trimToMaxTokens();
    this.logger.info(
      `Buffer now contains ${this.buffer.length} messages, ${this.currentTokens} tokens`,
      ConversationTokenBufferMemory.name,
    );
  }

  /**
   * Remove messages from the beginning of the buffer until we're under the token limit
   */
  private trimToMaxTokens(): void {
    let removedCount = 0;
    while (this.currentTokens > this.maxTokens && this.buffer.length > 0) {
      const oldestMessage = this.buffer[0];
      const oldestMessageTokens = this.countMessageTokens(oldestMessage);

      this.buffer.shift();
      this.currentTokens -= oldestMessageTokens;
      removedCount++;
    }
    if (removedCount > 0) {
      this.logger.info(
        `Trimmed ${removedCount} messages to stay under token limit`,
        ConversationTokenBufferMemory.name,
      );
    }
  }

  /**
   * Trim to the specified token limit without changing the current buffer
   */
  public trimToTokens(tokens: number): BufferMemoryMessage[] {
    let tempBuffer = [...this.buffer];
    let tempTokenCount = this.currentTokens;

    // Remove oldest messages until we're under the specified token limit
    while (tempTokenCount > tokens && tempBuffer.length > 0) {
      const oldestMessage = tempBuffer[0];
      const oldestMessageTokens = this.countMessageTokens(oldestMessage);

      tempBuffer.shift();
      tempTokenCount -= oldestMessageTokens;
    }

    return tempBuffer;
  }

  /**
   * Count tokens in a single message
   */
  private countMessageTokens(message: BufferMemoryMessage): number {
    return this.llm.countTokens(message.text);
  }

  /**
   * Count the total tokens in the buffer by analyzing all messages
   * This performs a fresh count to ensure accuracy
   */
  public countBufferTokens(): number {
    if (this.buffer.length === 0) return 0;

    // Create a single string with all messages to count tokens more accurately
    const allText = this.buffer.map((msg) => msg.text).join('\n');
    return this.llm.countTokens(allText);
  }

  /**
   * Recalculate the current token count (useful after buffer manipulations)
   */
  public recalculateTokens(): void {
    this.currentTokens = this.countBufferTokens();
  }

  /**
   * Set a new maximum token limit and trim the buffer if necessary
   */
  public setMaxTokens(newMaxTokens: number): void {
    this.logger.info(
      `Setting new max token limit: ${this.maxTokens} -> ${newMaxTokens}`,
      ConversationTokenBufferMemory.name,
    );
    this.maxTokens = newMaxTokens;
    this.trimToMaxTokens();
  }

  /**
   * Get the current token count (estimated)
   */
  public getCurrentTokenCount(): number {
    return this.currentTokens;
  }

  /**
   * Get the maximum token limit
   */
  public getMaxTokens(): number {
    return this.maxTokens;
  }

  /**
   * Clear the memory buffer and reset token count
   */
  override clear(): void {
    this.logger.info(
      `Clearing token buffer memory (${this.buffer.length} messages, ${this.currentTokens} tokens)`,
      ConversationTokenBufferMemory.name,
    );
    super.clear();
    this.currentTokens = 0;
  }

  /**
   * Handle adding multiple messages at once
   */
  public addMessages(messages: BufferMemoryMessage[]): void {
    // Calculate total tokens before adding
    let additionalTokens = 0;
    for (const message of messages) {
      additionalTokens += this.countMessageTokens(message);
    }

    // Add all messages
    this.buffer.push(...messages);
    this.currentTokens += additionalTokens;

    // Trim if necessary
    this.trimToMaxTokens();
  }

  /**
   * Duplicate the memory instance
   * This creates a new instance with the same configuration and buffer
   */
  public duplicate(): ConversationTokenBufferMemory {
    const newMemory = new ConversationTokenBufferMemory(
      this.ctbm_config,
      this.llm,
      this.logger,
    );
    newMemory.buffer = [...this.buffer];
    newMemory.currentTokens = this.currentTokens;
    newMemory.maxTokens = this.maxTokens;
    return newMemory;
  }

  /**
   * Override the kill method to clear the memory
   */
  public kill(): void {
    this.logger.info(
      'Killing token buffer memory',
      ConversationTokenBufferMemory.name,
    );
    this.clear();
  }
}
