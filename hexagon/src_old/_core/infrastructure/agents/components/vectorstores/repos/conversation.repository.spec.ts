import { ConversationRepository } from './conversation.repository';

function mkModel() {
  const store: any = new Map<string, any>();
  return {
    find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    findById: jest.fn((id: string) => ({
      exec: jest.fn().mockResolvedValue(store.get(id) || null),
    })),
    findByIdAndUpdate: jest.fn((id: string, update: any) => ({
      exec: jest.fn().mockImplementation(async () => {
        const cur = store.get(id);
        if (!cur) return null;
        if (update.$push?.checkpoints) {
          cur.checkpoints = [
            ...(cur.checkpoints || []),
            update.$push.checkpoints,
          ];
        } else if (update.$pull?.checkpoints) {
          cur.checkpoints = (cur.checkpoints || []).filter(
            (c: any) => c._id !== update.$pull.checkpoints._id,
          );
        } else {
          Object.assign(cur, update);
        }
        return cur;
      }),
    })),
    findByIdAndDelete: jest.fn((id: string) => ({
      exec: jest.fn().mockResolvedValue(store.get(id) || null),
    })),
    __store: store,
  } as any;
}

describe('ConversationRepository', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
  const model = mkModel();
  const repo = new ConversationRepository(model as any, logger);

  beforeEach(() => {
    jest.clearAllMocks();
    model.__store.clear();
  });

  it('findById logs not found', async () => {
    const res = await repo.findById('nope' as any);
    expect(res).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('createCheckpoint returns null when conversation missing', async () => {
    const out = await repo.createCheckpoint('c1' as any, { name: 'cp' });
    expect(out).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('createCheckpoint pushes checkpoint and returns updated conversation', async () => {
    model.__store.set('c1', {
      _id: 'c1',
      currentNode: 'n1',
      messages: [],
      memoryRecords: {},
      checkpoints: [],
    });
    const out = await repo.createCheckpoint('c1' as any, { name: 'cp' });
    expect(out?.checkpoints?.length).toBe(1);
    expect(logger.info).toHaveBeenCalled();
  });

  it('listCheckpoints and getCheckpoint handle missing conversation', async () => {
    const list = await repo.listCheckpoints('x' as any);
    expect(list).toBeNull();
    const get = await repo.getCheckpoint('x' as any, 'id');
    expect(get).toBeNull();
  });

  it('deleteCheckpoint removes entry when present', async () => {
    model.__store.set('c1', {
      _id: 'c1',
      checkpoints: [{ _id: 'a' }, { _id: 'b' }],
      messages: [],
      currentNode: 'n',
      memoryRecords: {},
    });
    const out = await repo.deleteCheckpoint('c1' as any, 'a');
    expect(out?.checkpoints?.find((c: any) => c._id === 'a')).toBeUndefined();
  });

  it('restoreCheckpoint returns errors for missing conversation or checkpoint', async () => {
    let out = await repo.restoreCheckpoint('nope' as any, 'x');
    expect(out.success).toBe(false);
    model.__store.set('c1', {
      _id: 'c1',
      checkpoints: [],
      messages: [],
      currentNode: 'n',
      memoryRecords: {},
    });
    out = await repo.restoreCheckpoint('c1' as any, 'x');
    expect(out.success).toBe(false);
    model.__store.set('c2', {
      _id: 'c2',
      checkpoints: [
        {
          _id: 'a',
          conversationState: {
            currentNode: 'n',
            messages: [],
            snippets: [],
            memoryRecords: {},
          },
        },
      ],
      messages: [],
      currentNode: 'n',
      memoryRecords: {},
    });
    out = await repo.restoreCheckpoint('c2' as any, 'b');
    expect(out.success).toBe(false);
  });

  it('restoreCheckpoint updates conversation state when found', async () => {
    model.__store.set('c3', {
      _id: 'c3',
      checkpoints: [
        {
          _id: 'a',
          conversationState: {
            currentNode: 'n2',
            messages: [{ _id: '1' }],
            snippets: [],
            memoryRecords: {},
          },
        },
      ],
      messages: [],
      currentNode: 'n1',
      memoryRecords: {},
    });
    const out = await repo.restoreCheckpoint('c3' as any, 'a');
    expect(out.success).toBe(true);
    expect(logger.info).toHaveBeenCalled();
  });
});
