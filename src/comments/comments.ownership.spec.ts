import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  createMockTransactionalContext,
} from '../audit-log/testing/transaction-test.helpers';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { CommentsService } from './comments.service';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentMention } from './entities/comment-mention.entity';
import { Comment } from './entities/comment.entity';
import { createMockMentionRepository } from './testing/mention.fixtures';
import { mockCommentEntity } from './testing/comment.fixtures';

/**
 * Slice 7 — comment mutations must belong to the ticket in the URL.
 */
describe('CommentsService ticket ownership (Slice 7)', () => {
  let service: CommentsService;
  let commentRepository: jest.Mocked<
    Pick<Repository<Comment>, 'findOne' | 'save' | 'remove'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;

  const updateDto: UpdateCommentDto = { version: 1, content: 'Updated' };

  beforeEach(async () => {
    const ctx = createMockTransactionalContext();
    const transactionalManager = ctx.manager;

    commentRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<Comment>, 'findOne' | 'save' | 'remove'>
    >;

    const mentionRepository = createMockMentionRepository();

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Comment) {
        return commentRepository;
      }
      if (entity === CommentMention) {
        return mentionRepository;
      }
      return { find: jest.fn().mockResolvedValue([]) };
    }) as unknown as typeof transactionalManager.getRepository;

    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepository },
        {
          provide: getRepositoryToken(CommentMention),
          useValue: mentionRepository,
        },
        { provide: TicketsService, useValue: { findOne: jest.fn() } },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: ctx.dataSource },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  describe('update', () => {
    it('rejects update when comment belongs to another ticket', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(service.update(1, 20, updateDto, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(commentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 20, ticketId: 1 },
      });
      expect(commentRepository.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('does not change version when ownership validation fails', async () => {
      const foreignComment = mockCommentEntity({
        id: 20,
        ticketId: 2,
        version: 5,
      });
      commentRepository.findOne.mockImplementation(async (options) => {
        const where = (options as { where: { id: number; ticketId: number } })
          .where;
        if (where.ticketId === 1 && where.id === 20) {
          return null;
        }
        return foreignComment;
      });

      await expect(service.update(1, 20, updateDto, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(commentRepository.save).not.toHaveBeenCalled();
      expect(foreignComment.version).toBe(5);
    });

    it('succeeds when comment belongs to the ticket in the URL', async () => {
      const existing = mockCommentEntity({ id: 20, ticketId: 2, content: 'Before' });
      const saved = mockCommentEntity({
        id: 20,
        ticketId: 2,
        content: 'Updated',
      });
      commentRepository.findOne.mockResolvedValue(existing);
      commentRepository.save.mockResolvedValue(saved);

      const result = await service.update(2, 20, updateDto, 2);

      expect(result.content).toBe('Updated');
      expect(commentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 20, ticketId: 2 },
      });
      expect(auditLogService.record).toHaveBeenCalled();
    });

    it('still rejects stale version before mutation for owned comment', async () => {
      commentRepository.findOne.mockResolvedValue(
        mockCommentEntity({ id: 20, ticketId: 2, version: 3 }),
      );

      await expect(
        service.update(2, 20, { version: 1, content: 'Stale' }, 2),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(commentRepository.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejects delete when comment belongs to another ticket', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(1, 20, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(commentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 20, ticketId: 1 },
      });
      expect(commentRepository.remove).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('succeeds when comment belongs to the ticket in the URL', async () => {
      const existing = mockCommentEntity({ id: 20, ticketId: 2 });
      commentRepository.findOne.mockResolvedValue(existing);
      commentRepository.remove.mockResolvedValue(existing);

      await service.remove(2, 20, 2);

      expect(commentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 20, ticketId: 2 },
      });
      expect(commentRepository.remove).toHaveBeenCalledWith(existing);
      expect(auditLogService.record).toHaveBeenCalled();
    });
  });
});
