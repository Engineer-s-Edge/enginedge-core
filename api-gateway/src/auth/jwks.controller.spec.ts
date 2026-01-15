import { JwksController } from './jwks.controller';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('JwksController', () => {
  let controller: JwksController;

  beforeEach(() => {
    controller = new JwksController();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getJwks', () => {
    it('should fetch jwks from identity service', async () => {
      mockedAxios.get.mockResolvedValue({ data: { keys: [] } });
      const result = await controller.getJwks();
      expect(result).toEqual({ keys: [] });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('.well-known/jwks.json')
      );
    });
  });
});
