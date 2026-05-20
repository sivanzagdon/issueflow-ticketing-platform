import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { UserRole } from '../../common/enums/user-role.enum';
import { UsersService } from '../../users/users.service';
import { mockUserResponse } from '../../users/testing/user.fixtures';
import { JwtPayload } from '../auth.types';
import { TokenDenylistService } from '../token-denylist.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;
  let tokenDenylist: jest.Mocked<Pick<TokenDenylistService, 'isInvalidated'>>;

  const payload: JwtPayload = {
    sub: 1,
    username: 'jdoe',
    role: UserRole.DEVELOPER,
  };

  const authReq = {
    headers: { authorization: 'Bearer test.jwt.token' },
  } as Request;

  beforeEach(async () => {
    usersService = {
      findOne: jest.fn(),
    };

    tokenDenylist = {
      isInvalidated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: usersService },
        { provide: TokenDenylistService, useValue: tokenDenylist },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
    tokenDenylist.isInvalidated.mockReturnValue(false);
  });

  it('validates payload and returns safe request user without passwordHash', async () => {
    usersService.findOne.mockResolvedValue(mockUserResponse());

    const result = await strategy.validate(authReq, payload);

    expect(tokenDenylist.isInvalidated).toHaveBeenCalledWith('test.jwt.token');
    expect(usersService.findOne).toHaveBeenCalledWith(payload.sub);
    expect(result).toEqual(mockUserResponse());
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('maps sub claim to user id via profile lookup', async () => {
    usersService.findOne.mockResolvedValue(
      mockUserResponse({ id: 42, username: 'asmith' }),
    );

    const result = await strategy.validate(authReq, { ...payload, sub: 42 });

    expect(usersService.findOne).toHaveBeenCalledWith(42);
    expect(result.id).toBe(42);
  });

  it('rejects invalidated tokens', async () => {
    tokenDenylist.isInvalidated.mockReturnValue(true);

    await expect(strategy.validate(authReq, payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.findOne).not.toHaveBeenCalled();
  });
});
