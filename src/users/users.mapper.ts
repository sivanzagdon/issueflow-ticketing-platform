import { User } from './entities/user.entity';

export type UserResponse = Omit<User, 'passwordHash'>;

export function toUserResponse(user: User): UserResponse {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
