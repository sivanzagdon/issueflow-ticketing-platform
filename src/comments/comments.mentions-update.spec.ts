import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { mockUserEntity } from '../users/testing/user.fixtures';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { TicketsService } from '../tickets/tickets.service';
import { CommentsService } from './comments.service';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';
import { mockCommentEntity } from './testing/comment.fixtures';
import {
  CommentMentionEntityStub,
  CommentResponseWithMentions,
  createMockMentionRepository,
  mockMentionedUser,
  mockUserFindByUsernames,
} from './testing/mention.fixtures';

type CommentWithVersion = Comment & { version: number };

/**
 * Slice 11 — mention re-evaluation on comment update + optimistic-lock guards.
 */
describe('CommentsService mentions — update (Slice 11)', () => {
  let service: CommentsService;
  let commentRepository: jest.Mocked<Pick<Repository<Comment>, 'findOne' | 'save'>>;
  let mentionRepository: jest.Mocked<
    Pick<
      Repository<CommentMentionEntityStub>,
      'save' | 'delete' | 'find' | 'remove'
    >
  >;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'find'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  const withVersion = (
    overrides: Partial<Comment> & { version: number },
  ): CommentWithVersion => ({
    ...mockCommentEntity(overrides),
    version: overrides.version,
  });

  beforeEach(async () => {
    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    commentRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Comment>, 'findOne' | 'save'>>;

    mentionRepository = {
      ...createMockMentionRepository(),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<
      Pick<
        Repository<CommentMentionEntityStub>,
        'save' | 'delete' | 'find' | 'remove' | 'create'
      >
    >;

    userRepository = { find: jest.fn().mockResolvedValue([]) };
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Comment) {
        return commentRepository;
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
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  const mockUsersByUsername = (users: User[]) => {
    mockUserFindByUsernames(userRepository, users);
  };

  it('re-evaluates mentions when comment content is updated', async () => {
    const existing = withVersion({
      id: 4,
      content: 'Before @john',
      version: 1,
    });
    commentRepository.findOne.mockResolvedValue(existing);
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => ({
      ...entity,
      version: entity.version + 1,
    }));
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
      mockUserEntity({ id: 11, username: 'jane', fullName: 'Jane Roe' }),
    ]);

    const dto: UpdateCommentDto = { version: 1, content: 'After @jane only' };
    const result = (await service.update(4, dto, 2)) as CommentResponseWithMentions;

    expect(result.content).toBe('After @jane only');
    expect(result.mentionedUsers).toEqual([
      mockMentionedUser({ id: 11, username: 'jane', fullName: 'Jane Roe' }),
    ]);
  });

  it('removes stale mention associations after update', async () => {
    const existing = withVersion({ id: 4, content: '@john', version: 1 });
    commentRepository.findOne.mockResolvedValue(existing);
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => ({
      ...entity,
      version: entity.version + 1,
    }));
    mockUsersByUsername([]);

    await service.update(4, { version: 1, content: 'No mentions now' }, 2);

    expect(mentionRepository.delete).toHaveBeenCalled();
  });

  it('persists newly added mentions after update', async () => {
    const existing = withVersion({ id: 4, content: 'Plain', version: 1 });
    commentRepository.findOne.mockResolvedValue(existing);
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => ({
      ...entity,
      version: entity.version + 1,
    }));
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);

    const result = (await service.update(
      4,
      { version: 1, content: 'Now @john' },
      2,
    )) as CommentResponseWithMentions;

    expect(mentionRepository.save).toHaveBeenCalled();
    expect(result.mentionedUsers).toHaveLength(1);
  });

  it('preserves unchanged mentions across update', async () => {
    const existing = withVersion({ id: 4, content: '@john', version: 1 });
    commentRepository.findOne.mockResolvedValue(existing);
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => ({
      ...entity,
      version: entity.version + 1,
    }));
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);

    const result = (await service.update(
      4,
      { version: 1, content: 'Still @john here' },
      2,
    )) as CommentResponseWithMentions;

    expect(result.mentionedUsers).toEqual([
      mockMentionedUser({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);
  });

  it('runs mention sync inside the same transaction as save and audit', async () => {
    const existing = withVersion({ id: 4, content: 'Before', version: 1 });
    const callOrder: string[] = [];

    dataSource.transaction.mockImplementation(async (work) => {
      callOrder.push('transaction');
      return work(transactionalManager);
    });
    commentRepository.findOne.mockImplementation(async () => {
      callOrder.push('lookup');
      return existing;
    });
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => {
      callOrder.push('save');
      return { ...entity, version: entity.version + 1 };
    });
    mentionRepository.save.mockImplementation(async () => {
      callOrder.push('mentions');
      return undefined;
    });
    auditLogService.record.mockImplementation(async (..._args) => {
      callOrder.push('audit');
      return { id: 1 } as Awaited<ReturnType<AuditLogService['record']>>;
    });
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);

    await service.update(4, { version: 1, content: 'After @john' }, 2);

    expect(callOrder[0]).toBe('transaction');
    expect(callOrder.indexOf('lookup')).toBeGreaterThan(
      callOrder.indexOf('transaction'),
    );
    expect(callOrder.indexOf('mentions')).toBeGreaterThan(callOrder.indexOf('save'));
    expect(callOrder.indexOf('audit')).toBeGreaterThan(callOrder.indexOf('mentions'));
  });

  it('does not mutate mention associations on stale optimistic-lock update', async () => {
    commentRepository.findOne.mockResolvedValue(
      withVersion({ id: 4, content: '@john', version: 2 }),
    );

    await expect(
      service.update(4, { version: 1, content: 'Stale @jane' }, 2),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mentionRepository.save).not.toHaveBeenCalled();
    expect(mentionRepository.delete).not.toHaveBeenCalled();
    expect(commentRepository.save).not.toHaveBeenCalled();
  });

  it('does not write Audit Log on stale update that would change mentions', async () => {
    commentRepository.findOne.mockResolvedValue(
      withVersion({ id: 4, content: '@john', version: 2 }),
    );

    await expect(
      service.update(4, { version: 1, content: 'Stale @jane' }, 2),
    ).rejects.toThrow();

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('writes UPDATE audit on successful mention re-evaluation', async () => {
    const existing = withVersion({ id: 4, content: 'Before', version: 1 });
    commentRepository.findOne.mockResolvedValue(existing);
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => ({
      ...entity,
      version: entity.version + 1,
    }));
    mockUsersByUsername([
      mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
    ]);

    await service.update(4, { version: 1, content: 'After @john' }, 2);

    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.COMMENT,
      entityId: 4,
    });
  });
});
