import { S3StorageService } from './s3-storage.service';
import { MyLogger } from '../../../services/logger/logger.service';
import { S3Client } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

function mockListObjectsResult(keys: string[]) {
  return {
    Contents: keys.map((k, i) => ({
      Key: k,
      LastModified: new Date(2020, 0, i + 1),
      Size: 10,
      ETag: `etag-${i}`,
    })),
    NextContinuationToken: undefined,
  };
}

describe('S3StorageService', () => {
  let service: S3StorageService;
  let logger: MockLogger;
  let client: S3Client & { send: jest.Mock };

  beforeEach(() => {
    logger = new MockLogger();
    service = new S3StorageService(logger as any, {
      endpoint: 'http://localhost:9000',
      accessKeyId: 'x',
      secretAccessKey: 'y',
      region: 'us-east-1',
      forcePathStyle: true,
    });
    client = service.getClient() as unknown as S3Client & { send: jest.Mock };
  });

  it('lists objects with filters and sorts by lastModified desc', async () => {
    client.send.mockResolvedValueOnce(
      mockListObjectsResult(['a.jsonl', 'b.txt', 'c.JSON']),
    );
    const res = await service.listObjects('bucket', {
      extensions: ['.jsonl', '.json'],
    });
    expect(res.map((o) => o.key)).toEqual(['c.JSON', 'a.jsonl']);
  });

  it('getObject returns body content and errors bubble with log', async () => {
    client.send.mockResolvedValueOnce({
      Body: { transformToString: jest.fn().mockResolvedValue('hello') },
    });
    await expect(service.getObject('b', 'k')).resolves.toBe('hello');

    client.send.mockResolvedValueOnce({ Body: undefined });
    await expect(service.getObject('b', 'k')).rejects.toThrow(/no content/);
  });

  it('putObject uploads and logs', async () => {
    client.send.mockResolvedValueOnce({});
    await expect(
      service.putObject('b', 'k', 'data', 'text/plain'),
    ).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalled();
  });

  it('deleteObjectsWithPrefix deletes in batches', async () => {
    // 0. list -> 1500 objects to force two batches
    const keys = Array.from({ length: 1500 }, (_, i) => `pref/item-${i}.json`);
    client.send.mockResolvedValueOnce(mockListObjectsResult(keys));

    // 1. delete batch 1
    client.send.mockResolvedValueOnce({});
    // 2. delete batch 2
    client.send.mockResolvedValueOnce({});

    await service.deleteObjectsWithPrefix('bucket', 'pref/');
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Deleted batch of 1000 objects'),
      'S3StorageService',
    );
  });
});
