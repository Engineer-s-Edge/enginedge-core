import axios from 'axios';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolCall, ToolOutput } from '../../toolkit.interface';

type VT_Op = 'url-scan' | 'url-report' | 'file-report';

interface VirusTotalArgs {
  op: VT_Op;
  url?: string;
  resource?: string; // hash or scan id
  apiKey?: string; // optional override
}

interface VirusTotalOutput extends ToolOutput {
  data: any;
}

export class VirusTotalActor extends BaseActor<
  VirusTotalArgs,
  VirusTotalOutput
> {
  _id: ToolIdType = 't_000000000000000000000203' as unknown as ToolIdType;
  name = 'virustotal.actor';
  description = 'VirusTotal URL scan and report retrieval.';
  useCase = 'Security checks for URLs or files (hash-based report).';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: { type: 'string', enum: ['url-scan', 'url-report', 'file-report'] },
      url: { type: 'string' },
      resource: { type: 'string' },
      apiKey: { type: 'string' },
    },
  };

  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'virustotal.actor',
      args: { op: 'url-scan', url: 'https://example.com' },
    } as ToolCall,
  ];
  retries = 1;
  errorEvent = [
    {
      name: 'AxiosError',
      guidance: 'Check API key and endpoint limits.',
      retryable: true,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private getApiKey(override?: string): string {
    const apiKey = override || process.env.VIRUSTOTAL_API_KEY || '';
    if (!apiKey) {
      this.logger.error(
        'VirusTotal API key missing',
        undefined,
        this.constructor.name,
      );
    } else {
      this.logger.debug('VirusTotal API key found', this.constructor.name);
    }
    return apiKey;
  }

  protected async act(args: VirusTotalArgs): Promise<VirusTotalOutput> {
    this.logger.info(
      `Executing VirusTotal operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `VirusTotal args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const apiKey = this.getApiKey(args.apiKey);
    if (!apiKey)
      throw Object.assign(new Error('VirusTotal API key missing'), {
        name: 'ValidationError',
      });

    const headers = { 'x-apikey': apiKey };
    switch (args.op) {
      case 'url-scan': {
        if (!args.url) {
          this.logger.error(
            'url required for url-scan operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('url required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(`Scanning URL: ${args.url}`, this.constructor.name);
        const res = await axios.post(
          'https://www.virustotal.com/api/v3/urls',
          `url=${encodeURIComponent(args.url)}`,
          { headers },
        );
        this.logger.info(
          `URL scan completed: ${args.url}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'url-report': {
        if (!args.resource) {
          this.logger.error(
            'resource (id) required for url-report operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('resource (id) required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Getting URL report: ${args.resource}`,
          this.constructor.name,
        );
        const res = await axios.get(
          `https://www.virustotal.com/api/v3/analyses/${args.resource}`,
          { headers },
        );
        this.logger.info(
          `URL report retrieved: ${args.resource}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'file-report': {
        if (!args.resource) {
          this.logger.error(
            'resource (hash) required for file-report operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('resource (hash) required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Getting file report: ${args.resource}`,
          this.constructor.name,
        );
        const res = await axios.get(
          `https://www.virustotal.com/api/v3/files/${args.resource}`,
          { headers },
        );
        this.logger.info(
          `File report retrieved: ${args.resource}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      default:
        this.logger.error(
          `Unsupported VirusTotal operation: ${args.op}`,
          undefined,
          this.constructor.name,
        );
        throw Object.assign(new Error(`Unsupported op: ${args.op}`), {
          name: 'ValidationError',
        });
    }
  }
}

export default VirusTotalActor;
