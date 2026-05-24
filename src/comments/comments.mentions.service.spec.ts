import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { createMockTransactionalContext } from '../audit-log/testing/transaction-test.helpers';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockTicketEntity } from '../tickets/testing/ticket.fixtures';
import { Ticket } from '../tickets/entities/ticket.entity';
import { mockUserEntity } from '../users/testing/user.fixtures';
import { User } from '../users/entities/user.entity';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment } from './entities/comment.entity';
import { mockCommentEntity } from './testing/comment.fixtures';
import {
  CommentMentionEntityStub,
  CommentResponseWithMentions,
  createMockMentionRepository,
  expectCommentWithMentionsShape,
  mockMentionedUser,
  mockUserFindByUsernames,
} from './testing/mention.fixtures';

/**
 * Slice 11 — @username mention parsing and comment response contract.
 * Unknown usernames are ignored (no association, no error).
 */
describe('CommentsService mentions — create (Slice 11)', () => {
  let service: CommentsService;
  let commentRepository: jest.Mocked<
    Pick<Repository<Comment>, 'create' | 'save' | 'find'>
  >;
  let mentionRepository: jest.Mocked<
    Pick<Repository<CommentMentionEntityStub>, 'save' | 'find'>
  >;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne' | 'find'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  beforeEach(async () => {
    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    commentRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<Comment>, 'create' | 'save' | 'find'>
    >;

    mentionRepository = createMockMentionRepository() as unknown as jest.Mocked<
      Pick<Repository<CommentMentionEntityStub>, 'save' | 'find' | 'create' | 'delete'>
    >;

    ticketRepository = { findOne: jest.fn() };
    userRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    usersService = { findOne: jest.fn() };

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Comment) {
        return commentRepository;
      }
      if (entity === Ticket) {
        return ticketRepository;
      }
      if (entity === User) {
        return userRepository;
      }
      if (entity === CommentMentionEntityStub) {
        return mentionRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepository },
        {
          provide: getRepositoryToken(CommentMentionEntityStub),
          useValue: mentionRepository,
        },
        { provide: TicketsService, useValue: { findOne: jest.fn() } },
        { provide: UsersService, useValue: usersService },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn().mockResolvedValue({ id: 1 }) },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  const setupCreate = (content: string, authorId = 2) => {
    const dto: CreateCommentDto = { authorId, content };
    const entity = mockCommentEntity({ content, authorId });
    ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: authorId }));
    commentRepository.create.mockReturnValue(entity);
    commentRepository.save.mockResolvedValue(entity);
    return dto;
  };

  const mockUsersByUsername = (users: User[]) => {
    mockUserFindByUsernames(userRepository, users);
  };

  it('returns mentionedUsers: [] when content has no mentions', async () => {
    const dto = setupCreate('Plain comment without mentions');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toEqual([]);
    expectCommentWithMentionsShape(result);
  });

  it('resolves @john to the matching user', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
    const dto = setupCreate('Hey @john please review');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toEqual([
      mockMentionedUser({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
  });

  it('persists all unique users when multiple distinct mentions exist', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
      mockUserEntity({ id: 11, username: 'jane', fullName: 'Jane Roe' }),
    ]);
    const dto = setupCreate('Ping @john and @jane');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toHaveLength(2);
    expect(result.mentionedUsers.map((u) => u.username).sort()).toEqual([
      'jane',
      'john',
    ]);
  });

  it('creates only one association for duplicate @john @john mentions', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
    const dto = setupCreate('Thanks @john and again @john');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toHaveLength(1);
    expect(result.mentionedUsers[0].username).toBe('john');
  });

  it('matches mentions case-insensitively (@John resolves username john)', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
    const dto = setupCreate('Hello @John');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toEqual([
      mockMentionedUser({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
  });

  it('syncMentions resolves users via ILike repository lookup at runtime', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
    const dto = setupCreate('Hello @John');

    await service.create(1, dto);

    expect(userRepository.find).toHaveBeenCalledWith({
      where: [{ username: ILike('John') }],
    });
  });

  it('ignores unknown usernames without throwing', async () => {
    mockUsersByUsername([]);
    const dto = setupCreate('Hello @ghost and @also_missing');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toEqual([]);
  });

  it('does not crash on malformed mention tokens', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
    const dto = setupCreate('Edge @ @john @@bad email@john.com @john!');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toEqual([
      mockMentionedUser({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
  });

  it('extracts mentions deterministically across whitespace and newlines', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
      mockUserEntity({ id: 11, username: 'jane', fullName: 'Jane Roe' }),
    ]);
    const dto = setupCreate('Line1 @john\nLine2   @jane\t@end');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers.map((u) => u.id)).toEqual([10, 11]);
  });

  it('returns mentionedUsers in deterministic order by user id', async () => {
    mockUsersByUsername([
      mockUserEntity({ id: 20, username: 'zara', fullName: 'Zara Z' }),
      mockUserEntity({ id: 5, username: 'amy', fullName: 'Amy A' }),
    ]);
    const dto = setupCreate('Hi @zara and @amy');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.mentionedUsers.map((u) => u.id)).toEqual([5, 20]);
  });

  it('includes version field alongside mentionedUsers', async () => {
    const dto = setupCreate('No mentions');

    const result = (await service.create(1, dto)) as CommentResponseWithMentions;

    expect(result.version).toBeDefined();
    expect(typeof result.version).toBe('number');
  });
});
