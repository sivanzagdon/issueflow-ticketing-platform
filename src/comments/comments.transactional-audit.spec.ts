import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { mockTicketEntity } from '../tickets/testing/ticket.fixtures';
import { Ticket } from '../tickets/entities/ticket.entity';
import { mockUserEntity } from '../users/testing/user.fixtures';
import { User } from '../users/entities/user.entity';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';
import { mockCommentEntity } from './testing/comment.fixtures';

/**
 * Regression: comment mutations and audit writes must share one transaction.
 * Lookup/validation must not escape the boundary where a rollback would leave
 * inconsistent state relative to the audit trail.
 */
describe('CommentsService transactional audit (regression)', () => {
  let service: CommentsService;
  let commentRepository: jest.Mocked<
    Pick<Repository<Comment>, 'create' | 'save' | 'findOne' | 'remove'>
  >;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let ticketsService: jest.Mocked<Pick<TicketsService, 'findOne'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  const createDto: CreateCommentDto = {
    authorId: 2,
    content: 'Transactional comment',
  };

  beforeEach(async () => {
    commentRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<Comment>, 'create' | 'save' | 'findOne' | 'remove'>
    >;

    ticketRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };
    ticketsService = { findOne: jest.fn() };
    usersService = { findOne: jest.fn() };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;
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
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepository },
        { provide: TicketsService, useValue: ticketsService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  describe('create', () => {
    beforeEach(() => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
      userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 2 }));
    });

    it('runs comment persistence and audit inside dataSource.transaction', async () => {
      const entity = mockCommentEntity({ id: 10 });
      commentRepository.create.mockReturnValue(entity);
      commentRepository.save.mockResolvedValue(entity);

      await service.create(1, createDto);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.CREATE,
        entityType: AuditEntityType.COMMENT,
        entityId: 10,
        performedBy: createDto.authorId,
        actorType: AuditActor.USER,
        details: expect.objectContaining({
          ticketId: 1,
          authorId: createDto.authorId,
          content: createDto.content,
        }),
      });
    });

    it('persists comment through manager.getRepository(Comment) create and save', async () => {
      const entity = mockCommentEntity({ id: 11 });
      const transactionalRepo = {
        create: jest.fn().mockReturnValue(entity),
        save: jest.fn().mockResolvedValue(entity),
      };

      transactionalManager.getRepository = jest.fn((entityArg: unknown) => {
        if (entityArg === Comment) {
          return transactionalRepo;
        }
        if (entityArg === Ticket) {
          return ticketRepository;
        }
        if (entityArg === User) {
          return userRepository;
        }
        throw new Error(`Unexpected entity: ${String(entityArg)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      commentRepository.create.mockImplementation(() => {
        throw new Error('default repository must not be used inside transaction');
      });
      commentRepository.save.mockImplementation(() => {
        throw new Error('default repository must not be used inside transaction');
      });

      await service.create(1, createDto);

      expect(transactionalManager.getRepository).toHaveBeenCalledWith(Comment);
      expect(transactionalRepo.create).toHaveBeenCalledTimes(1);
      expect(transactionalRepo.save).toHaveBeenCalledTimes(1);
    });

    it('validates ticket and author inside the same transaction callback', async () => {
      const entity = mockCommentEntity({ id: 12 });
      commentRepository.create.mockReturnValue(entity);
      commentRepository.save.mockResolvedValue(entity);

      const callOrder: string[] = [];
      dataSource.transaction.mockImplementation(async (work) => {
        callOrder.push('transaction');
        return work(transactionalManager);
      });
      ticketRepository.findOne.mockImplementation(async () => {
        callOrder.push('ticketValidation');
        return mockTicketEntity({ id: 1 });
      });
      userRepository.findOne.mockImplementation(async () => {
        callOrder.push('authorValidation');
        return mockUserEntity({ id: 2 });
      });

      await service.create(1, createDto);

      expect(callOrder.indexOf('transaction')).toBeLessThan(
        callOrder.indexOf('ticketValidation'),
      );
      expect(callOrder.indexOf('transaction')).toBeLessThan(
        callOrder.indexOf('authorValidation'),
      );
    });

    it('does not write audit when comment save fails inside transaction', async () => {
      commentRepository.create.mockReturnValue(mockCommentEntity());
      commentRepository.save.mockRejectedValue(new Error('save failed'));

      await expect(service.create(1, createDto)).rejects.toThrow('save failed');
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('rolls back comment creation when audit record fails', async () => {
      commentRepository.create.mockReturnValue(mockCommentEntity({ id: 13 }));
      commentRepository.save.mockResolvedValue(mockCommentEntity({ id: 13 }));
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.create(1, createDto)).rejects.toThrow(
        'audit insert failed',
      );
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    const updateDto: UpdateCommentDto = { version: 1, content: 'Updated body' };

    it('runs comment save and audit inside dataSource.transaction', async () => {
      const existing = mockCommentEntity({ id: 4, content: 'Before' });
      const saved = mockCommentEntity({ id: 4, content: 'Updated body' });
      commentRepository.findOne.mockResolvedValue(existing);
      commentRepository.save.mockResolvedValue(saved);

      await service.update(4, updateDto, 2);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.COMMENT,
        entityId: 4,
        performedBy: 2,
        actorType: AuditActor.USER,
        details: {
          content: { before: 'Before', after: 'Updated body' },
        },
      });
    });

    it('loads and saves comment through manager.getRepository(Comment) inside transaction', async () => {
      const existing = mockCommentEntity({ id: 4, content: 'Before' });
      const saved = mockCommentEntity({ id: 4, content: 'Updated body' });
      const transactionalRepo = {
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockResolvedValue(saved),
      };

      transactionalManager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Comment) {
          return transactionalRepo;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      commentRepository.findOne.mockImplementation(() => {
        throw new Error('default repository must not load comment for update');
      });

      await service.update(4, updateDto, 2);

      expect(transactionalRepo.findOne).toHaveBeenCalledWith({
        where: { id: 4 },
      });
      expect(transactionalRepo.save).toHaveBeenCalled();
      expect(commentRepository.findOne).not.toHaveBeenCalled();
    });

    it('does not write audit when comment save fails inside transaction', async () => {
      commentRepository.findOne.mockResolvedValue(
        mockCommentEntity({ id: 4, content: 'Before' }),
      );
      commentRepository.save.mockRejectedValue(new Error('save failed'));

      await expect(service.update(4, updateDto, 2)).rejects.toThrow('save failed');
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('rolls back comment update when audit record fails', async () => {
      commentRepository.findOne.mockResolvedValue(
        mockCommentEntity({ id: 4, content: 'Before' }),
      );
      commentRepository.save.mockResolvedValue(
        mockCommentEntity({ id: 4, content: 'Updated body' }),
      );
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.update(4, updateDto, 2)).rejects.toThrow(
        'audit insert failed',
      );
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('runs comment removal and audit inside dataSource.transaction', async () => {
      const existing = mockCommentEntity({ id: 4 });
      commentRepository.findOne.mockResolvedValue(existing);
      commentRepository.remove.mockResolvedValue(existing);

      await service.remove(4, 2);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.DELETE,
        entityType: AuditEntityType.COMMENT,
        entityId: 4,
        performedBy: 2,
        actorType: AuditActor.USER,
      });
    });

    it('loads and removes comment through manager.getRepository(Comment) inside transaction', async () => {
      const existing = mockCommentEntity({ id: 4 });
      const transactionalRepo = {
        findOne: jest.fn().mockResolvedValue(existing),
        remove: jest.fn().mockResolvedValue(existing),
      };

      transactionalManager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Comment) {
          return transactionalRepo;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      commentRepository.findOne.mockImplementation(() => {
        throw new Error('default repository must not load comment for delete');
      });

      await service.remove(4, 2);

      expect(transactionalRepo.findOne).toHaveBeenCalledWith({
        where: { id: 4 },
      });
      expect(transactionalRepo.remove).toHaveBeenCalledWith(existing);
      expect(commentRepository.findOne).not.toHaveBeenCalled();
    });

    it('does not write audit when comment remove fails inside transaction', async () => {
      commentRepository.findOne.mockResolvedValue(mockCommentEntity({ id: 4 }));
      commentRepository.remove.mockRejectedValue(new Error('remove failed'));

      await expect(service.remove(4, 2)).rejects.toThrow('remove failed');
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('rolls back comment delete when audit record fails', async () => {
      commentRepository.findOne.mockResolvedValue(mockCommentEntity({ id: 4 }));
      commentRepository.remove.mockResolvedValue(mockCommentEntity({ id: 4 }));
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.remove(4, 2)).rejects.toThrow('audit insert failed');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('does not write audit when comment is missing', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
