import { DataLakeService } from './data-lake.service';
import { S3StorageService } from './s3-storage.service';
import { MyLogger } from '../../../services/logger/logger.service';

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('DataLakeService', () => {
  let service: DataLakeService;
  let storage: jest.Mocked<S3StorageService>;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    storage = {
      listObjects: jest.fn(),
      getObject: jest.fn(),
      putObject: jest.fn(),
      deleteObjectsWithPrefix: jest.fn(),
      getClient: jest.fn() as any,
    } as unknown as jest.Mocked<S3StorageService>;

    service = new DataLakeService(storage, logger as any);
  });

  it('loadRecords reads JSONL and JSON, logs warnings on parse errors, and limits to 10 files', async () => {
    storage.listObjects.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        key: i % 2 === 0 ? `f${i}.jsonl` : `f${i}.json`,
      })) as any,
    );
    storage.getObject.mockImplementation(async (_bucket, key) => {
      if (key.endsWith('.jsonl')) {
        return '{"id":"1"}\ninvalid\n{"id":"2"}\n';
      }
      return JSON.stringify([{ id: '3' }, { id: '4' }]);
    });

    const records = await service.loadRecords('bucket');
    // Service limits to the first 10 files: 5 .jsonl (2 valid lines each => 10) + 5 .json (2 items each => 10) = 20 total
    expect(records.length).toBe(20);
    expect(storage.listObjects).toHaveBeenCalledWith(
      'bucket',
      expect.objectContaining({ extensions: ['.jsonl', '.json'] }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('applyFilters handles search, dates, tags, and equality', () => {
    const items = [
      {
        id: '1',
        title: 'Hello',
        content: 'World',
        tags: ['a'],
        published_date: '2020-01-01',
      },
      {
        id: '2',
        title: 'Bye',
        content: 'Mars',
        tags: ['b'],
        published_date: '2020-02-01',
      },
    ];
    const res = service.applyFilters(items as any, {
      searchQuery: 'hello',
      dateFrom: '2019-12-31',
      dateTo: '2020-01-31',
      tags: ['a'],
      content: 'World',
    });
    expect(res.map((x) => x.id)).toEqual(['1']);
  });

  it('paginate returns correct slice with hasMore', () => {
    const res = service.paginate(
      Array.from({ length: 50 }, (_, i) => i),
      2,
      10,
    );
    expect(res.items.length).toBe(10);
    expect(res.page).toBe(2);
    expect(res.hasMore).toBe(true);
  });

  it('sortByDate sorts desc by default and supports ascending', () => {
    const items = [
      { id: '1', published_date: '2020-01-01' },
      { id: '2', published_date: '2020-02-01' },
    ];
    const desc = service.sortByDate(items as any);
    expect(desc.map((x) => x.id)).toEqual(['2', '1']);
    const asc = service.sortByDate(items as any, 'published_date', true);
    expect(asc.map((x) => x.id)).toEqual(['1', '2']);
  });

  it('extractMetadata aggregates unique values and tags', () => {
    const items = [
      { id: '1', author: 'A', tags: ['x', 'y'] },
      { id: '2', author: 'B', tags: ['y', 'z'] },
    ];
    const meta = service.extractMetadata(items as any, ['author', 'tags']);
    expect(meta.author).toEqual(['A', 'B']);
    expect(meta.tags).toEqual(['x', 'y', 'z']);
  });

  it('deduplicateRecords keeps first occurrence and logs', () => {
    const items = [
      { id: '1', t: 1 },
      { id: '1', t: 2 },
      { id: '2', t: 3 },
    ];
    const res = service.deduplicateRecords(items as any);
    expect(res.map((x) => x.id)).toEqual(['1', '2']);
    expect(logger.info).toHaveBeenCalled();
  });

  it('filterNewRecords removes existing ids and logs summary', () => {
    const res = service.filterNewRecords(
      [{ id: '1' }, { id: '2' }] as any,
      [{ id: '1' }] as any,
    );
    expect(res).toEqual([{ id: '2' }]);
    expect(logger.info).toHaveBeenCalled();
  });

  it('storeRecord delegates to storage and logs, propagating errors', async () => {
    await service.storeRecord('b', 'k', 'c', 'ct');
    expect(storage.putObject).toHaveBeenCalledWith('b', 'k', 'c', 'ct');

    storage.putObject.mockRejectedValueOnce(new Error('fail'));
    await expect(service.storeRecord('b', 'k', 'c')).rejects.toThrow('fail');
    expect(logger.error).toHaveBeenCalled();
  });

  it('deleteObjectsWithPrefix delegates to storage and logs, propagating errors', async () => {
    await service.deleteObjectsWithPrefix('b', 'p/');
    expect(storage.deleteObjectsWithPrefix).toHaveBeenCalledWith('b', 'p/');

    storage.deleteObjectsWithPrefix.mockRejectedValueOnce(new Error('oops'));
    await expect(service.deleteObjectsWithPrefix('b', 'p/')).rejects.toThrow(
      'oops',
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
