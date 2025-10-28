import { VectorStoreRepository } from './store.repository';

function mkModel() {
  const store: any = new Map<string, any>();
  // Constructible function with save()
  const FakeModel: any = function (this: any, doc: any) {
    Object.assign(this, doc);
    this.save = jest.fn().mockImplementation(async () => {
      const id = doc._id || String(store.size + 100);
      const saved = { _id: id, ...doc };
      store.set(id, saved);
      return saved;
    });
  };
  // Static-like methods used by repository
  FakeModel.find = jest.fn((q?: any) => ({
    exec: jest.fn().mockResolvedValue(
      q?.documentId
        ? [...store.values()].filter((v: any) => v.documentId === q.documentId)
        : Array.isArray(q?.$or)
          ? [...store.values()].filter((v: any) => {
              const ownerCond = q.$or.find((c: any) => c.ownerId !== undefined);
              const allowCond = q.$or.find((c: any) => c.allowedUserIds?.$in);
              const ownerOk = ownerCond
                ? v.ownerId === ownerCond.ownerId
                : false;
              const allowOk = allowCond
                ? (v.allowedUserIds || []).includes(
                    allowCond.allowedUserIds.$in[0],
                  )
                : false;
              return ownerOk || allowOk;
            })
          : q?.ownerId
            ? [...store.values()].filter((v: any) => v.ownerId === q.ownerId)
            : [...store.values()],
    ),
  }));
  FakeModel.findById = jest.fn((id: string) => ({
    exec: jest.fn().mockResolvedValue(store.get(id) || null),
  }));
  FakeModel.findByIdAndUpdate = jest.fn((id: string, update: any) => ({
    exec: jest.fn().mockImplementation(async () => {
      const cur = store.get(id);
      if (!cur) return null;
      Object.assign(cur, update);
      return cur;
    }),
  }));
  FakeModel.findByIdAndDelete = jest.fn((id: string) => ({
    exec: jest.fn().mockResolvedValue(store.get(id) || null),
  }));
  FakeModel.__store = store;
  return FakeModel;
}

describe('VectorStoreRepository', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
  const Model: any = mkModel();
  const repo = new VectorStoreRepository(Model as any, logger);

  beforeEach(() => {
    jest.clearAllMocks();
    Model.__store.clear();
    Model.__store.set('1', {
      _id: '1',
      ownerId: 'u1',
      documentId: 'd1',
      allowedUserIds: ['u2'],
    });
    Model.__store.set('2', {
      _id: '2',
      ownerId: 'u3',
      documentId: 'd2',
      allowedUserIds: [],
    });
  });

  it('findAll and findById work and log', async () => {
    const all = await repo.findAll();
    expect(all.length).toBe(2);
    const one = await repo.findById('1' as any);
    expect(one?._id).toBe('1');
    const missing = await repo.findById('x' as any);
    expect(missing).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('findAllByOwnerId and findAllByAccess filter properly', async () => {
    const byOwner = await repo.findAllByOwnerId('u1');
    expect(byOwner.length).toBe(1);
    const byAccess = await repo.findAllByAccess('u2');
    expect(byAccess.length).toBe(1);
  });

  it('findByDocumentId filters by documentId', async () => {
    const docs = await repo.findByDocumentId('d2');
    expect(docs.length).toBe(1);
  });

  it('create, update, delete operate on the model', async () => {
    const created = await repo.create({
      documentName: 'X',
      ownerId: 'u9',
    } as any);
    expect(created).toHaveProperty('documentName', 'X');
    // Since our mock model doesn't persist in create, test update/delete through existing items
    const updated = await repo.update('1' as any, { documentName: 'New' });
    expect(updated?.documentName).toBe('New');
    const deleted = await repo.delete('2' as any);
    expect(deleted?._id).toBe('2');
  });
});
