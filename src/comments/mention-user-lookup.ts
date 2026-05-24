import { ILike, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

/**
 * Resolve mentioned users with case-insensitive username matching at the DB layer
 * (PostgreSQL ILIKE via TypeORM ILike).
 */
export async function findUsersByMentionUsernames(
  userRepo: Repository<User>,
  usernames: string[],
): Promise<User[]> {
  if (usernames.length === 0) {
    return [];
  }

  const users = await userRepo.find({
    where: usernames.map((name) => ({ username: ILike(name) })),
  });

  return orderMatchedMentionUsers(users, usernames);
}

export function orderMatchedMentionUsers(
  users: User[],
  usernamesInAppearanceOrder: string[],
): User[] {
  const byLower = new Map(users.map((u) => [u.username.toLowerCase(), u]));
  const matched: User[] = [];

  for (const name of usernamesInAppearanceOrder) {
    const user = byLower.get(name.toLowerCase());
    if (user && !matched.some((m) => m.id === user.id)) {
      matched.push(user);
    }
  }

  matched.sort((a, b) => a.id - b.id);
  return matched;
}
