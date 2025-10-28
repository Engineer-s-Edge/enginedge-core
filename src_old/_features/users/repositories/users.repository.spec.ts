import { UsersRepository } from './users.repository';
import { Model } from 'mongoose';
import { User, UserDocument } from '../entities/user.entity';

// Simple helper to create an exec() chainable mock
const chain = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('UsersRepository', () => {
  let repo: UsersRepository;
  let model: jest.Mocked<Model<UserDocument>> & { new: any };

  beforeEach(() => {
    model = {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    } as any;

    // new this.userModel(user) -> we need to simulate constructor and save()
    (model as any).mockImplementation = undefined;
    (model as any).prototype = {};

    repo = new UsersRepository(model as unknown as Model<UserDocument>);
  });

  it('findAll calls model.find().exec()', async () => {
    const users = [{ username: 'a' } as User];
    model.find.mockReturnValue(chain(users) as any);

    const res = await repo.findAll();
    expect(res).toBe(users);
    expect(model.find).toHaveBeenCalledWith();
  });

  it('findById calls model.findById(id).exec()', async () => {
    const user = { username: 'b' } as User;
    model.findById.mockReturnValue(chain(user) as any);

    const res = await repo.findById('123');
    expect(res).toBe(user);
    expect(model.findById).toHaveBeenCalledWith('123');
  });

  it('findByUsername calls model.findOne({ username }).exec()', async () => {
    const user = { username: 'carol' } as User;
    model.findOne.mockReturnValue(chain(user) as any);

    const res = await repo.findByUsername('carol');
    expect(res).toBe(user);
    expect(model.findOne).toHaveBeenCalledWith({ username: 'carol' });
  });

  it('create constructs model and saves', async () => {
    const saved = { id: '1', username: 'd' } as any;
    const save = jest.fn().mockResolvedValue(saved);
    const ctor = jest.fn().mockImplementation(() => ({ save }));

    // Replace "new this.userModel()" behavior
    repo = new (class extends UsersRepository {
      constructor() {
        // @ts-ignore
        super(ctor);
      }
    })();

    const res = await repo.create({ username: 'd' });
    expect(ctor).toHaveBeenCalledWith({ username: 'd' });
    expect(save).toHaveBeenCalled();
    expect(res).toBe(saved);
  });

  it('update delegates to findByIdAndUpdate(id, user, { new: true }).exec()', async () => {
    const updated = { id: '2', username: 'e' } as any;
    model.findByIdAndUpdate.mockReturnValue(chain(updated) as any);

    const res = await repo.update('2', { username: 'e' });
    expect(res).toBe(updated);
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      '2',
      { username: 'e' },
      { new: true },
    );
  });

  it('delete delegates to findByIdAndDelete(id).exec()', async () => {
    const deleted = { id: '3' } as any;
    model.findByIdAndDelete.mockReturnValue(chain(deleted) as any);

    const res = await repo.delete('3');
    expect(res).toBe(deleted);
    expect(model.findByIdAndDelete).toHaveBeenCalledWith('3');
  });
});
