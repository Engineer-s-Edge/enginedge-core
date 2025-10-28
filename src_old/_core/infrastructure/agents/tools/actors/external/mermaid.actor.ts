import axios from 'axios';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolCall, ToolOutput } from '../../toolkit.interface';

type MermaidFormat = 'svg' | 'png' | 'pdf';

interface MermaidArgs {
  diagram: string; // Mermaid code
  format?: MermaidFormat;
  serverUrl?: string; // Kroki or Mermaid live server, default Kroki
}

interface MermaidOutput extends ToolOutput {
  data: any;
}

export class MermaidActor extends BaseActor<MermaidArgs, MermaidOutput> {
  _id: ToolIdType = 't_000000000000000000000204' as unknown as ToolIdType;
  name = 'mermaid.render';
  description = 'Render Mermaid diagrams to SVG/PNG/PDF via Kroki.';
  useCase = 'Produce diagrams for documentation and UI.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['diagram'],
    properties: {
      diagram: { type: 'string', minLength: 1 },
      format: { type: 'string', enum: ['svg', 'png', 'pdf'], default: 'svg' },
      serverUrl: { type: 'string' },
    },
  };

  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'mermaid.render',
      args: { diagram: 'graph TD; A-->B;' },
    } as ToolCall,
  ];
  retries = 0;
  errorEvent = [
    {
      name: 'AxiosError',
      guidance: 'Check Kroki server availability.',
      retryable: true,
    },
  ];
  parallel = true;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  protected async act(args: MermaidArgs): Promise<MermaidOutput> {
    this.logger.info(
      `Rendering Mermaid diagram to ${args.format || 'svg'} format`,
      this.constructor.name,
    );
    this.logger.debug(
      `Mermaid args: ${JSON.stringify({ ...args, diagram: args.diagram.substring(0, 100) + '...' })}`,
      this.constructor.name,
    );

    try {
      const format = args.format || 'svg';
      const server = (
        args.serverUrl ||
        process.env.KROKI_URL ||
        'https://kroki.io'
      ).replace(/\/$/, '');
      const url = `${server}/mermaid/${format}`;

      this.logger.debug(`Mermaid server URL: ${url}`, this.constructor.name);
      this.logger.debug(
        `Diagram length: ${args.diagram.length} characters`,
        this.constructor.name,
      );

      this.logger.debug(
        'Sending diagram to Kroki server for rendering',
        this.constructor.name,
      );
      const res = await axios.post(url, args.diagram, {
        headers: { 'Content-Type': 'text/plain' },
        responseType: 'arraybuffer',
      });

      const buf = Buffer.from(res.data);
      const base64 = buf.toString('base64');
      const mime =
        format === 'svg'
          ? 'image/svg+xml'
          : format === 'png'
            ? 'image/png'
            : 'application/pdf';

      this.logger.info(
        `Mermaid diagram rendered successfully: ${format} format, ${buf.length} bytes`,
        this.constructor.name,
      );
      this.logger.debug(
        `Response status: ${res.status}, content type: ${mime}`,
        this.constructor.name,
      );

      return {
        data: {
          ok: true,
          data: {
            encoding: 'base64',
            data: base64,
            length: buf.length,
            format,
          },
        } as any,
        mimeType: mime as any,
      };
    } catch (error: any) {
      this.logger.error(
        `Mermaid rendering failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default MermaidActor;
