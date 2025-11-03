import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from './google-auth.service';
import { MyLogger } from '../../../services/logger/logger.service';

const generateAuthUrl = jest.fn().mockReturnValue('http://auth');
const setCredentials = jest.fn();
const getToken = jest
  .fn()
  .mockResolvedValue({ tokens: { access_token: 'abc' } });

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl,
        setCredentials,
        getToken,
      })),
    },
  },
}));

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let config: Partial<ConfigService>;
  let logger: MockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new MockLogger();
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, any> = {
          'googleCalendar.clientId': 'cid',
          'googleCalendar.clientSecret': 'secret',
          'googleCalendar.redirectUri': 'http://redir',
          'googleCalendar.refreshToken': 'rtok',
          'googleCalendar.scopes': ['x', 'y'],
          'urls.googleRedirectUri': 'http://redir2',
        };
        return map[key];
      }),
    } as any;
    service = new GoogleAuthService(config as ConfigService, logger as any);
  });

  it('generates auth URL using configured scopes', () => {
    const url = service.generateAuthUrl();
    expect(url).toBe('http://auth');
    expect(generateAuthUrl).toHaveBeenCalledWith({
      access_type: 'offline',
      scope: ['x', 'y'],
      prompt: 'consent',
    });
  });

  it('exchanges code for tokens and sets credentials', async () => {
    const tokens = await service.getTokenFromCode('code123');
    expect(tokens).toEqual({ access_token: 'abc' });
    expect(getToken).toHaveBeenCalledWith('code123');
    expect(setCredentials).toHaveBeenCalledWith({ access_token: 'abc' });
  });

  it('setCredentials proxies to OAuth2 client', () => {
    service.setCredentials({ access_token: 't' });
    expect(setCredentials).toHaveBeenCalledWith({ access_token: 't' });
  });
});
