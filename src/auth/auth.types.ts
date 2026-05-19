import { UserRole } from '../common/enums/user-role.enum';
import { UserResponse } from '../users/users.mapper';

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface JwtPayload {
  sub: number;
  username: string;
  role: UserRole;
}

export type AuthenticatedUser = UserResponse;
