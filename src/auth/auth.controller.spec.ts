import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  expectNoPasswordHash,
  mockLoginResponse,
} from './testing/auth.fixtures';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      validateUser: jest.fn(),
      logout: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('login', () => {
    it('delegates to AuthService.login', async () => {
      const loginDto = { username: 'jdoe', password: 'secret' };
      const loginResponse = mockLoginResponse();
      authService.login.mockResolvedValue(loginResponse);

      const result = await controller.login(loginDto);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual(loginResponse);
      expectNoPasswordHash(result);
    });
  });

  describe('logout', () => {
    it('delegates to AuthService.logout with request', async () => {
      const req = {
        headers: { authorization: 'Bearer abc.def.ghi' },
      } as Request;
      authService.logout.mockResolvedValue(undefined);

      await controller.logout(req);

      expect(authService.logout).toHaveBeenCalledWith(req);
    });
  });

  describe('me', () => {
    it('returns current authenticated user profile without passwordHash', () => {
      const currentUser = mockUserResponse();
      const request = { user: currentUser } as Parameters<AuthController['me']>[0];

      const result = controller.me(request);

      expect(result).toEqual(currentUser);
      expectNoPasswordHash(result);
    });
  });
});
