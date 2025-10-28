import { BaseTool } from './BaseTool';
import { ToolOutput, RAGConfig } from '../toolkit.interface';

/**
 * Base class for actor-style Tools (modify data, no RAG parameters).
 */
export abstract class BaseActor<
  Args,
  Output extends ToolOutput,
> extends BaseTool<Args, Output> {
  /** Always 'actor'; no RAG config is used. */
  type: 'actor' = 'actor';
  /** Actors do not use retrieverConfig. */
  retrieverConfig: undefined = undefined;

  constructor() {
    super();
    this.logger.info(
      `Initializing BaseActor: ${this.constructor.name}`,
      this.constructor.name,
    );
  }

  /**
   * Concrete logic for actor Tools, without RAG parameters.
   * @param args - arguments for the actor
   */
  protected abstract act(args: Args): Promise<Output>;

  /**
   * Internal dispatch: strips out any ragConfig and delegates to `act`.
   */
  protected override async executeTool(
    args: Args & { ragConfig?: RAGConfig },
  ): Promise<Output> {
    this.logger.debug(
      `BaseActor executing tool: ${this.constructor.name}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Actor args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );
    const result = await this.act(args as Args);
    this.logger.debug(
      `BaseActor completed execution: ${this.constructor.name}`,
      this.constructor.name,
    );
    return result;
  }
}
