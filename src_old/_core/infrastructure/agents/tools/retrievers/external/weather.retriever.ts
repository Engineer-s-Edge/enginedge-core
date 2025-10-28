import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import axios from 'axios';

interface WeatherArgs {
  lat: number;
  lon: number;
  hourly?: string[];
  daily?: string[];
  timezone?: string;
}
interface WeatherOutput extends ToolOutput {
  data: any;
}

export class WeatherRetriever extends BaseRetriever<
  WeatherArgs,
  WeatherOutput
> {
  _id: ToolIdType = 't_000000000000000000000312' as unknown as ToolIdType;
  name = 'weather.retrieve';
  description = 'Retrieve weather forecasts from Open-Meteo.';
  useCase = 'Get weather data for planning.';

  constructor() {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 1,
      top_kModifiable: false,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['lat', 'lon'],
    properties: {
      lat: { type: 'number' },
      lon: { type: 'number' },
      hourly: { type: 'array', items: { type: 'string' } },
      daily: { type: 'array', items: { type: 'string' } },
      timezone: { type: 'string' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'weather.retrieve',
      args: { lat: 43.6532, lon: -79.3832, hourly: ['temperature_2m'] },
    } as ToolCall,
  ];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: any[]) => r[r.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  protected async retrieve(
    args: WeatherArgs & { ragConfig: RAGConfig },
  ): Promise<WeatherOutput> {
    this.logger.info(
      `Retrieving weather data for coordinates: ${args.lat}, ${args.lon}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Weather args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const params: any = { latitude: args.lat, longitude: args.lon };
    if (args.hourly && args.hourly.length) {
      params.hourly = args.hourly.join(',');
      this.logger.debug(
        `Hourly parameters: ${params.hourly}`,
        this.constructor.name,
      );
    }
    if (args.daily && args.daily.length) {
      params.daily = args.daily.join(',');
      this.logger.debug(
        `Daily parameters: ${params.daily}`,
        this.constructor.name,
      );
    }
    if (args.timezone) {
      params.timezone = args.timezone;
      this.logger.debug(`Timezone: ${args.timezone}`, this.constructor.name);
    }

    this.logger.debug(
      `API request parameters: ${JSON.stringify(params)}`,
      this.constructor.name,
    );

    try {
      this.logger.debug(
        'Making API request to Open-Meteo',
        this.constructor.name,
      );
      const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params,
        timeout: 10000,
      });
      this.logger.info(
        `Weather data retrieved successfully for coordinates: ${args.lat}, ${args.lon}`,
        this.constructor.name,
      );
      this.logger.debug(
        `API response status: ${res.status}, data size: ${JSON.stringify(res.data).length} chars`,
        this.constructor.name,
      );
      return {
        data: { ok: true, data: res.data } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `Weather API request failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default WeatherRetriever;
