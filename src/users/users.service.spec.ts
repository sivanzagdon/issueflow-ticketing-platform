import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { User } from './entities/user.entity';
import { mockUserEntity, mockUserResponse } from './testing/user.fixtures';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;

  const createDto: CreateUserDto = {
    username: 'jdoe',
    email: 'jdoe@example.com',
    fullName: 'John Doe',
    role: UserRole.DEVELOPER,
    password: 'secret123',
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn().mockResolvedValue({ id: 1 }) },
        },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(new Map([[User, repository]])),
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    it('creates a user with valid fields and stores a password hash', async () => {
      const entity = mockUserEntity();
      repository.create.mockReturnValue(entity);
      repository.save.mockResolvedValue(entity);

      const result = await service.create(createDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: createDto.username,
          email: createDto.email,
          fullName: createDto.fullName,
          role: createDto.role,
          passwordHash: expect.any(String),
        }),
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ password: expect.anything() }),
      );
      expect(repository.save).toHaveBeenCalledWith(entity);
      expect(result).toEqual(mockUserResponse());
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('does not expose passwordHash in the create response', async () => {
      repository.create.mockReturnValue(mockUserEntity());
      repository.save.mockResolvedValue(mockUserEntity());

      const result = await service.create(createDto);

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when username already exists', async () => {
      repository.create.mockReturnValue(mockUserEntity());
      repository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], {
          code: '23505',
          constraint: 'users_username_key',
        } as never),
      );

      await expect(service.create(createDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws ConflictException when email already exists', async () => {
      repository.create.mockReturnValue(mockUserEntity());
      repository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], {
          code: '23505',
          constraint: 'users_email_key',
        } as never),
      );

      await expect(service.create(createDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('returns all users without passwordHash', async () => {
      repository.find.mockResolvedValue([
        mockUserEntity(),
        mockUserEntity({ id: 2, username: 'asmith', email: 'asmith@example.com' }),
      ]);

      const result = await service.findAll();

      expect(repository.find).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      result.forEach((user) => {
        expect(user).not.toHaveProperty('passwordHash');
      });
    });
  });

  describe('findOne', () => {
    it('returns a user by id without passwordHash', async () => {
      repository.findOne.mockResolvedValue(mockUserEntity());

      const result = await service.findOne(1);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(mockUserResponse());
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when user does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates fullName and role and omits passwordHash from response', async () => {
      const existing = mockUserEntity();
      const updated = mockUserEntity({
        fullName: 'Jane Doe',
        role: UserRole.ADMIN,
      });
      const updateDto: UpdateUserDto = {
        fullName: 'Jane Doe',
        role: UserRole.ADMIN,
      };

      repository.findOne.mockResolvedValue(existing);
      repository.save.mockResolvedValue(updated);

      const result = await service.update(1, updateDto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          fullName: 'Jane Doe',
          role: UserRole.ADMIN,
        }),
      );
      expect(result).toEqual(
        mockUserResponse({ fullName: 'Jane Doe', role: UserRole.ADMIN }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when updating a missing user', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, { fullName: 'Jane Doe' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a user by id', async () => {
      repository.findOne.mockResolvedValue(mockUserEntity());
      repository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.remove(1);

      expect(repository.delete).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws NotFoundException when deleting a missing user', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
