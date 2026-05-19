import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../../common/enums/user-role.enum';
import { UsersService } from '../../users/users.service';
import { mockUserResponse } from '../../users/testing/user.fixtures';
import { JwtPayload } from '../auth.types';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const payload: JwtPayload = {
    sub: 1,
    username: 'jdoe',
    role: UserRole.DEVELOPER,
  };

  beforeEach(async () => {
    usersService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('validates payload and returns safe request user without passwordHash', async () => {
    usersService.findOne.mockResolvedValue(mockUserResponse());

    const result = await strategy.validate(payload);

    expect(usersService.findOne).toHaveBeenCalledWith(payload.sub);
    expect(result).toEqual(mockUserResponse());
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('maps sub claim to user id via profile lookup', async () => {
    usersService.findOne.mockResolvedValue(
      mockUserResponse({ id: 42, username: 'asmith' }),
    );

    const result = await strategy.validate({ ...payload, sub: 42 });

    expect(usersService.findOne).toHaveBeenCalledWith(42);
    expect(result.id).toBe(42);
  });
});
