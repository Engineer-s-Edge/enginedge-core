jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { WeatherRetriever } from './weather.retriever';
import axios from 'axios';

jest.mock('axios');

describe('WeatherRetriever (behavior)', () => {
  it('fails validation if coordinates missing', async () => {
    const tool = new WeatherRetriever();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('assembles params and returns ok=true with API data', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: { ok: 1, hourly: { temperature_2m: [1, 2, 3] } },
    });
    const tool = new WeatherRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: {
        lat: 43.65,
        lon: -79.38,
        hourly: ['temperature_2m', 'precipitation'],
        daily: ['weathercode'],
        timezone: 'America/Toronto',
      } as any,
    });

    expect(res.success).toBe(true);
    const out = (res as any).output;
    expect(out.mimeType).toBe('application/json');
    expect(out.data.ok).toBe(true);
    expect(out.data.data).toEqual({
      ok: 1,
      hourly: { temperature_2m: [1, 2, 3] },
    });

    // Validate axios.get call and params shape
    expect(axios.get).toHaveBeenCalledTimes(1);
    const [url, config] = (axios.get as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.open-meteo.com/v1/forecast');
    expect(config.timeout).toBe(10000);
    expect(config.params).toEqual({
      latitude: 43.65,
      longitude: -79.38,
      hourly: 'temperature_2m,precipitation',
      daily: 'weathercode',
      timezone: 'America/Toronto',
    });
  });

  it('returns failure when axios throws', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const tool = new WeatherRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { lat: 1, lon: 2 } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('Error');
      expect(res.error.message).toBe('network');
    }
  });
});
