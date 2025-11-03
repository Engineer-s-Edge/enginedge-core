import { ToolOutput, RAGConfig } from '../toolkit.interface';
import { BaseTool } from './BaseTool';

/**
 * Base class for retriever-style Tools (query-based, with RAG parameters).
 */
export abstract class BaseRetriever<
  Args,
  Output extends ToolOutput,
> extends BaseTool<Args, Output> {
  /** Always 'retriever'; subclasses provide a default RAG config. */
  type: 'retriever' = 'retriever';
  /** Default retrieval parameters (similarity, top_k, etc.). */
  retrieverConfig: RAGConfig;

  constructor(defaultRagConfig: RAGConfig) {
    super();
    this.retrieverConfig = defaultRagConfig;
    this.logger.info(
      `Initializing BaseRetriever: ${this.constructor.name}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Default RAG config: ${JSON.stringify(defaultRagConfig)}`,
      this.constructor.name,
    );
  }

  /**
   * Concrete retrieval logic: must respect provided ragConfig.
   * @param args.args     - arguments for the retriever
   * @param args.ragConfig - retrieval parameters (similarity, top_k, etc.)
   */
  protected abstract retrieve(
    args: Args & { ragConfig: RAGConfig },
  ): Promise<Output>;

  /**
   * Internal dispatch: merges provided ragConfig with defaults, then calls `retrieve`.
   */
  protected override async executeTool(
    args: Args & { ragConfig?: RAGConfig },
  ): Promise<Output> {
    this.logger.debug(
      `BaseRetriever executing tool: ${this.constructor.name}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Retriever args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const effectiveConfig = args.ragConfig
      ? args.ragConfig
      : this.buildDefaultRagConfig();

    this.logger.debug(
      `Effective RAG config: ${JSON.stringify(effectiveConfig)}`,
      this.constructor.name,
    );
    const result = await this.retrieve({ ...args, ragConfig: effectiveConfig });
    this.logger.debug(
      `BaseRetriever completed execution: ${this.constructor.name}`,
      this.constructor.name,
    );
    return result;
  }

  /**
   * Build a new RAG config by overriding defaults.
   * @param overrides - partial RAGConfig to merge over defaults
   */
  protected buildDefaultRagConfig(overrides?: Partial<RAGConfig>): RAGConfig {
    this.logger.debug(
      `Building RAG config with overrides: ${JSON.stringify(overrides)}`,
      this.constructor.name,
    );
    const config = { ...this.retrieverConfig, ...(overrides || {}) };
    this.logger.debug(
      `Built RAG config: ${JSON.stringify(config)}`,
      this.constructor.name,
    );
    return config;
  }

  /**
   * Update a single parameter on an existing RAG config.
   * @param config - original RAGConfig
   * @param key    - field name to update
   * @param value  - new value for the field
   */
  protected updateRagParam<K extends keyof RAGConfig>(
    config: RAGConfig,
    key: K,
    value: RAGConfig[K],
  ): RAGConfig {
    this.logger.debug(
      `Updating RAG param ${key} to ${value}`,
      this.constructor.name,
    );
    const updatedConfig = { ...config, [key]: value };
    this.logger.debug(
      `Updated RAG config: ${JSON.stringify(updatedConfig)}`,
      this.constructor.name,
    );
    return updatedConfig;
  }
}
