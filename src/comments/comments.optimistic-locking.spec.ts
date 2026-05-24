import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { CommentsService } from './comments.service';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';
import { mockCommentEntity } from './testing/comment.fixtures';

type CommentWithVersion = Comment & { version: number };

/**
 * Slice 10 — comment optimistic locking / concurrent edit prevention.
 */
describe('CommentsService optimistic locking (Slice 10)', () => {
  let service: CommentsService;
  let commentRepository: jest.Mocked<Pick<Repository<Comment>, 'findOne' | 'save'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  const updateDto = (version: number, content: string): UpdateCommentDto =>
    ({ version, content }) as UpdateCommentDto;

  beforeEach(async () => {
    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    commentRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Comment>, 'findOne' | 'save'>>;

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Comment) {
        return commentRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepository },
        { provide: TicketsService, useValue: { findOne: jest.fn() } },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  const mockSaveIncrementsVersion = () => {
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => ({
      ...entity,
      version: entity.version + 1,
    }));
  };

  const withVersion = (
    overrides: Partial<Comment> & { version: number },
  ): CommentWithVersion => ({
    ...mockCommentEntity(overrides),
    version: overrides.version,
  });

  describe('update', () => {
    it('succeeds when submitted version matches persisted version', async () => {
      commentRepository.findOne.mockResolvedValue(
        withVersion({ content: 'Before', version: 1 }),
      );
      mockSaveIncrementsVersion();

      const result = await service.update(4, updateDto(1, 'After'), 2);

      expect(result.content).toBe('After');
      expect(commentRepository.save).toHaveBeenCalledTimes(1);
    });

    it('increments comment version on successful update', async () => {
      commentRepository.findOne.mockResolvedValue(
        withVersion({ content: 'Before', version: 2 }),
      );
      mockSaveIncrementsVersion();

      const result = await service.update(4, updateDto(2, 'After'), 2);

      expect(result).toHaveProperty('version', 3);
    });

    it('fails with ConflictException when submitted version is stale', async () => {
      commentRepository.findOne.mockResolvedValue(
        withVersion({ content: 'Current', version: 4 }),
      );

      await expect(
        service.update(4, updateDto(3, 'Stale'), 2),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not persist mutation when version is stale', async () => {
      commentRepository.findOne.mockResolvedValue(
        withVersion({ content: 'Current', version: 2 }),
      );

      await expect(
        service.update(4, updateDto(1, 'Stale'), 2),
      ).rejects.toThrow();

      expect(commentRepository.save).not.toHaveBeenCalled();
    });

    it('does not write Audit Log when version is stale', async () => {
      commentRepository.findOne.mockResolvedValue(withVersion({ version: 2 }));

      await expect(
        service.update(4, updateDto(1, 'Stale'), 2),
      ).rejects.toThrow();

      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('detects version conflict before save and audit inside transaction', async () => {
      const existing = withVersion({ content: 'Current', version: 2 });
      const callOrder: string[] = [];

      dataSource.transaction.mockImplementation(async (work) => {
        callOrder.push('transaction');
        return work(transactionalManager);
      });
      commentRepository.findOne.mockImplementation(async () => {
        callOrder.push('lookup');
        return existing;
      });
      commentRepository.save.mockImplementation(async () => {
        callOrder.push('save');
        return existing;
      });
      auditLogService.record.mockImplementation(async (..._args) => {
        callOrder.push('audit');
        return { id: 1 } as Awaited<ReturnType<AuditLogService['record']>>;
      });

      await expect(
        service.update(4, updateDto(1, 'Stale'), 2),
      ).rejects.toBeInstanceOf(ConflictException);

      // Slice 8 boundary: transaction opens first; lookup/version-check stay inside it.
      expect(callOrder[0]).toBe('transaction');
      expect(callOrder.indexOf('transaction')).toBeLessThan(callOrder.indexOf('lookup'));
      expect(callOrder).not.toContain('save');
      expect(callOrder).not.toContain('audit');
    });

    it('runs successful update and audit inside dataSource.transaction', async () => {
      commentRepository.findOne.mockResolvedValue(
        withVersion({ content: 'Before', version: 1 }),
      );
      mockSaveIncrementsVersion();

      await service.update(4, updateDto(1, 'After'), 2);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.COMMENT,
        entityId: 1,
      });
      expect(auditLogService.record).toHaveBeenCalledTimes(1);
    });

    it('propagates audit failure so update transaction rolls back', async () => {
      commentRepository.findOne.mockResolvedValue(
        withVersion({ content: 'Before', version: 1 }),
      );
      mockSaveIncrementsVersion();
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(
        service.update(4, updateDto(1, 'After'), 2),
      ).rejects.toThrow('audit insert failed');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(commentRepository.save).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when comment is missing', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, updateDto(1, 'Missing'), 2),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(commentRepository.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
