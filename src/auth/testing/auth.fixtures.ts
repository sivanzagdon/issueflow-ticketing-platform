import { LoginResponse } from '../auth.types';

export const mockLoginResponse = (
  overrides: Partial<LoginResponse> = {},
): LoginResponse => ({
  accessToken: 'signed-jwt-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  ...overrides,
});

export const expectNoPasswordHash = (value: unknown): void => {
  expect(value).toBeDefined();
  expect(value).not.toHaveProperty('passwordHash');
};
