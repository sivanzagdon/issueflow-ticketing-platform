import { UserRole } from '../../common/enums/user-role.enum';
import { User } from '../entities/user.entity';
import { UserResponse } from '../users.service';

export const mockUserEntity = (overrides: Partial<User> = {}): User => ({
  id: 1,
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  role: UserRole.DEVELOPER,
  passwordHash: '$2b$10$hashedpasswordvalue',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

export const mockUserResponse = (
  overrides: Partial<UserResponse> = {},
): UserResponse => {
  const { passwordHash: _passwordHash, ...user } = mockUserEntity(overrides);
  return user;
};

export const expectNoPasswordHash = (value: unknown): void => {
  expect(value).toBeDefined();
  expect(value).not.toHaveProperty('passwordHash');
};
