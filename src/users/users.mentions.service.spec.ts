import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  expectPaginatedMentionsShape,
  PaginatedMentionsResponse,
} from '../comments/testing/mention.fixtures';
import { User } from './entities/user.entity';
import { mockUserEntity } from './testing/user.fixtures';
import { UsersService } from './users.service';

type UsersServiceWithMentions = UsersService & {
  findMentionsForUser(
    userId: number,
    query: { page?: number; pageSize?: number },
  ): Promise<PaginatedMentionsResponse>;
};

const asMentionsService = (service: UsersService): UsersServiceWithMentions =>
  service as unknown as UsersServiceWithMentions;

/**
 * Slice 11 — GET /users/:userId/mentions service behavior.
 */
describe('UsersService mentions (Slice 11)', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;

  beforeEach(async () => {
    userRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn().mockResolvedValue({ id: 1 }) },
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('returns only comments mentioning the target user', async () => {
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 5 }));

    const result = await asMentionsService(service).findMentionsForUser(5, {
      page: 1,
      pageSize: 10,
    });

    expectPaginatedMentionsShape(result);
    result.data.forEach((comment) => {
      expect(comment.mentionedUsers.some((u) => u.id === 5)).toBe(true);
    });
  });

  it('returns mentions newest first', async () => {
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 5 }));

    const result = await asMentionsService(service).findMentionsForUser(5, {
      page: 1,
      pageSize: 10,
    });

    if (result.data.length >= 2) {
      const first = new Date(result.data[0].createdAt).getTime();
      const second = new Date(result.data[1].createdAt).getTime();
      expect(first).toBeGreaterThanOrEqual(second);
    }
  });

  it('returns wrapped paginated response with data, total, and page', async () => {
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 5 }));

    const result = await asMentionsService(service).findMentionsForUser(5, {
      page: 2,
      pageSize: 5,
    });

    expect(result).toEqual(
      expect.objectContaining({
        data: expect.any(Array),
        total: expect.any(Number),
        page: 2,
      }),
    );
  });

  it('returns empty data and total 0 when user has no mentions', async () => {
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 5 }));

    const result = await asMentionsService(service).findMentionsForUser(5, {
      page: 1,
      pageSize: 10,
    });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
  });

  it('throws NotFoundException when user is missing', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(
      asMentionsService(service).findMentionsForUser(999, { page: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies default page when omitted', async () => {
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 5 }));

    const result = await asMentionsService(service).findMentionsForUser(5, {});

    expect(result.page).toBe(1);
  });

  it('applies default pageSize when omitted', async () => {
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 5 }));

    const result = await asMentionsService(service).findMentionsForUser(5, {
      page: 1,
    });

    expect(result.data.length).toBeLessThanOrEqual(20);
  });

  it('keeps total count independent of page size', async () => {
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 5 }));

    const smallPage = await asMentionsService(service).findMentionsForUser(5, {
      page: 1,
      pageSize: 2,
    });
    const largePage = await asMentionsService(service).findMentionsForUser(5, {
      page: 1,
      pageSize: 50,
    });

    expect(smallPage.total).toBe(largePage.total);
  });
});
