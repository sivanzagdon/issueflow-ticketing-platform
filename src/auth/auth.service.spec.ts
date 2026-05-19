import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { mockUserEntity, mockUserResponse } from '../users/testing/user.fixtures';
import { AuthService } from './auth.service';
import { mockLoginResponse } from './testing/auth.fixtures';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let jwtService: jest.Mocked<JwtService>;
  const bcryptCompare = bcrypt.compare as jest.Mock;

  const loginDto = { username: 'jdoe', password: 'secret' };

  beforeEach(async () => {
    bcryptCompare.mockReset();

    userRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    jwtService = {
      sign: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('succeeds with valid username and password', async () => {
      const user = mockUserEntity();
      userRepository.findOne.mockResolvedValue(user);
      bcryptCompare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('signed-jwt-token');

      const result = await service.login(loginDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { username: loginDto.username },
      });
      expect(result).toEqual(mockLoginResponse());
    });

    it('compares plain password with stored passwordHash using bcrypt', async () => {
      const user = mockUserEntity();
      userRepository.findOne.mockResolvedValue(user);
      bcryptCompare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('signed-jwt-token');

      await service.login(loginDto);

      expect(bcryptCompare).toHaveBeenCalledWith(
        loginDto.password,
        user.passwordHash,
      );
    });

    it('returns accessToken, tokenType Bearer, and expiresIn', async () => {
      userRepository.findOne.mockResolvedValue(mockUserEntity());
      bcryptCompare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('signed-jwt-token');

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(3600);
    });

    it('signs JWT payload with user id, username, and role', async () => {
      const user = mockUserEntity();
      userRepository.findOne.mockResolvedValue(user);
      bcryptCompare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('signed-jwt-token');

      await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        username: user.username,
        role: user.role,
      });
    });

    it('rejects missing user with UnauthorizedException', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects invalid password with UnauthorizedException', async () => {
      userRepository.findOne.mockResolvedValue(mockUserEntity());
      bcryptCompare.mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('never exposes passwordHash in login response', async () => {
      userRepository.findOne.mockResolvedValue(mockUserEntity());
      bcryptCompare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('signed-jwt-token');

      const result = await service.login(loginDto);

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('validateUser', () => {
    it('returns safe user profile without passwordHash', async () => {
      userRepository.findOne.mockResolvedValue(mockUserEntity());
      bcryptCompare.mockResolvedValue(true as never);

      const result = await service.validateUser(loginDto.username, loginDto.password);

      expect(result).toEqual(mockUserResponse());
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws UnauthorizedException for invalid credentials when user is missing', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.validateUser(loginDto.username, loginDto.password),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for invalid credentials when password is wrong', async () => {
      userRepository.findOne.mockResolvedValue(mockUserEntity());
      bcryptCompare.mockResolvedValue(false as never);

      await expect(
        service.validateUser(loginDto.username, loginDto.password),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
