import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { expectNoPasswordHash, mockUserResponse } from './testing/user.fixtures';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get(UsersController);
  });

  it('applies JwtAuthGuard at controller level', () => {
    const guards = Reflect.getMetadata('__guards__', UsersController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it('marks create as public for registration', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, UsersController.prototype.create),
    ).toBe(true);
  });

  describe('findAll', () => {
    it('delegates to UsersService.findAll and returns users without passwordHash', async () => {
      const users = [
        mockUserResponse(),
        mockUserResponse({ id: 2, username: 'asmith', email: 'asmith@example.com' }),
      ];
      usersService.findAll.mockResolvedValue(users);

      const result = await controller.findAll();

      expect(usersService.findAll).toHaveBeenCalled();
      expect(result).toEqual(users);
      result.forEach(expectNoPasswordHash);
    });
  });

  describe('findOne', () => {
    it('delegates to UsersService.findOne with parsed userId', async () => {
      const user = mockUserResponse();
      usersService.findOne.mockResolvedValue(user);

      const result = await controller.findOne(1);

      expect(usersService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(user);
      expectNoPasswordHash(result);
    });
  });

  describe('create', () => {
    it('delegates to UsersService.create with request body', async () => {
      const dto: CreateUserDto = {
        username: 'jdoe',
        email: 'jdoe@example.com',
        fullName: 'John Doe',
        role: UserRole.DEVELOPER,
      };
      const created = mockUserResponse();
      usersService.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(usersService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
      expectNoPasswordHash(result);
    });
  });

  describe('update', () => {
    it('delegates to UsersService.update with userId and body', async () => {
      const dto: UpdateUserDto = {
        fullName: 'Jane Doe',
        role: UserRole.ADMIN,
      };
      const updated = mockUserResponse({
        fullName: 'Jane Doe',
        role: UserRole.ADMIN,
      });
      usersService.update.mockResolvedValue(updated);

      const result = await controller.update(1, dto);

      expect(usersService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(updated);
      expectNoPasswordHash(result);
    });
  });

  describe('remove', () => {
    it('delegates to UsersService.remove with parsed userId', async () => {
      usersService.remove.mockResolvedValue(undefined);

      await controller.remove(1);

      expect(usersService.remove).toHaveBeenCalledWith(1);
    });
  });
});
