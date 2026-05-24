import { ILike, Repository } from 'typeorm';
import { mockUserEntity } from '../users/testing/user.fixtures';
import { User } from '../users/entities/user.entity';
import {
  findUsersByMentionUsernames,
  orderMatchedMentionUsers,
} from './mention-user-lookup';

describe('mention-user-lookup', () => {
  describe('findUsersByMentionUsernames', () => {
    it('queries with ILike for case-insensitive PostgreSQL username matching', async () => {
      const find = jest.fn().mockResolvedValue([
        mockUserEntity({ id: 10, username: 'John', fullName: 'John Smith' }),
      ]);
      const userRepo = { find } as unknown as Repository<User>;

      await findUsersByMentionUsernames(userRepo, ['john']);

      expect(find).toHaveBeenCalledWith({
        where: [{ username: ILike('john') }],
      });
    });

    it('matches parsed usernames to stored users regardless of case', async () => {
      const find = jest.fn().mockResolvedValue([
        mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
      ]);
      const userRepo = { find } as unknown as Repository<User>;

      const matched = await findUsersByMentionUsernames(userRepo, ['John']);

      expect(matched).toHaveLength(1);
      expect(matched[0].username).toBe('john');
    });

    it('ignores unknown usernames', async () => {
      const find = jest.fn().mockResolvedValue([]);
      const userRepo = { find } as unknown as Repository<User>;

      const matched = await findUsersByMentionUsernames(userRepo, ['ghost']);

      expect(matched).toEqual([]);
    });
  });

  describe('orderMatchedMentionUsers', () => {
    it('dedupes by user id and returns results sorted by user id', () => {
      const users = [
        mockUserEntity({ id: 20, username: 'zara' }),
        mockUserEntity({ id: 5, username: 'amy' }),
      ];

      const matched = orderMatchedMentionUsers(users, ['zara', 'amy', 'Zara']);

      expect(matched.map((u) => u.id)).toEqual([5, 20]);
    });
  });
});
