import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { CommentsService } from '../comments/comments.service';
import { Comment } from '../comments/entities/comment.entity';
import { CommentMention } from '../comments/entities/comment-mention.entity';
import { createMockMentionRepository } from '../comments/testing/mention.fixtures';
import { mockCommentEntity } from '../comments/testing/comment.fixtures';
import { Project } from '../projects/entities/project.entity';
import { ProjectsService } from '../projects/projects.service';
import {
  mockProjectEntity,
  mockProjectResponse,
} from '../projects/testing/project.fixtures';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketsService } from '../tickets/tickets.service';
import { mockTicketEntity } from '../tickets/testing/ticket.fixtures';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { mockUserEntity, mockUserResponse } from '../users/testing/user.fixtures';
import { AuditLogService } from './audit-log.service';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from './testing/transaction-test.helpers';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));

/**
 * Contract: every state-changing domain operation runs in one transaction and
 * passes the active EntityManager to auditLogService.record(..., manager).
 */
describe('Audit log domain transactional writes (contract)', () => {
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let manager: ReturnType<typeof createMockTransactionalContext>['manager'];

  beforeEach(() => {
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };
    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    manager = ctx.manager;
  });

  const expectNoAuditOnMutationFailure = async (
    operation: () => Promise<unknown>,
  ) => {
    await expect(operation()).rejects.toBeDefined();
    expect(auditLogService.record).not.toHaveBeenCalled();
  };

  describe('UsersService', () => {
    let usersService: UsersService;
    let userRepository: jest.Mocked<Repository<User>>;

    beforeEach(async () => {
      userRepository = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        delete: jest.fn(),
      } as unknown as jest.Mocked<Repository<User>>;

      userRepository.create.mockReturnValue(mockUserEntity());
      manager.getRepository = jest.fn((entity: unknown) => {
        if (entity === User) {
          return userRepository;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as typeof manager.getRepository;

      const mentionRepository = createMockMentionRepository();
      const commentRepository = { find: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: userRepository },
          {
            provide: getRepositoryToken(CommentMention),
            useValue: mentionRepository,
          },
          {
            provide: getRepositoryToken(Comment),
            useValue: commentRepository,
          },
          { provide: AuditLogService, useValue: auditLogService },
          { provide: DataSource, useValue: dataSource },
        ],
      }).compile();

      usersService = module.get(UsersService);
    });

    it('create: transactional CREATE audit with after details', async () => {
      const saved = mockUserEntity({ id: 11 });
      userRepository.save.mockResolvedValue(saved);

      await usersService.create({
        username: 'tx-user',
        email: 'tx@example.com',
        fullName: 'Tx User',
        role: UserRole.DEVELOPER,
        password: 'password12',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.CREATE,
        entityType: AuditEntityType.USER,
        entityId: 11,
        actorType: AuditActor.USER,
        details: expect.objectContaining({
          username: saved.username,
          email: saved.email,
        }),
      });
    });

    it('create: does not write audit when user save fails', async () => {
      userRepository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], {
          code: '23505',
          constraint: 'users_username_key',
        } as never),
      );

      await expectNoAuditOnMutationFailure(() =>
        usersService.create({
          username: 'dup',
          email: 'dup@example.com',
          fullName: 'Dup',
          role: UserRole.DEVELOPER,
          password: 'password12',
        }),
      );
    });

    it('create: propagates failure when audit write fails (transaction rolls back)', async () => {
      userRepository.save.mockResolvedValue(mockUserEntity({ id: 12 }));
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(
        usersService.create({
          username: 'fail-audit',
          email: 'fail@example.com',
          fullName: 'Fail',
          role: UserRole.DEVELOPER,
          password: 'password12',
        }),
      ).rejects.toThrow('audit insert failed');
    });

    it('update: transactional UPDATE audit with before/after details', async () => {
      const entity = mockUserEntity({ id: 9 });
      userRepository.findOne.mockResolvedValue(entity);
      userRepository.save.mockResolvedValue({ ...entity, fullName: 'Updated' });

      await usersService.update(9, { fullName: 'Updated' }, 2);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.USER,
        entityId: 9,
        performedBy: 2,
        details: expect.objectContaining({
          fullName: expect.objectContaining({ before: 'John Doe', after: 'Updated' }),
        }),
      });
    });

    it('update: does not write audit when save fails', async () => {
      userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 9 }));
      userRepository.save.mockRejectedValue(new Error('save failed'));

      await expectNoAuditOnMutationFailure(() =>
        usersService.update(9, { fullName: 'X' }, 2),
      );
    });

    it('remove: transactional DELETE audit', async () => {
      userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 9 }));
      userRepository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await usersService.remove(9, 2);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.DELETE,
        entityType: AuditEntityType.USER,
        entityId: 9,
        performedBy: 2,
      });
    });
  });

  describe('ProjectsService', () => {
    let projectsService: ProjectsService;
    let projectRepository: jest.Mocked<Repository<Project>>;

    beforeEach(async () => {
      projectRepository = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        softDelete: jest.fn(),
      } as unknown as jest.Mocked<Repository<Project>>;

      projectRepository.create.mockReturnValue(mockProjectEntity());
      manager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Project) {
          return projectRepository;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as typeof manager.getRepository;

      const module = await Test.createTestingModule({
        providers: [
          ProjectsService,
          { provide: getRepositoryToken(Project), useValue: projectRepository },
          {
            provide: UsersService,
            useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
          },
          { provide: AuditLogService, useValue: auditLogService },
          { provide: DataSource, useValue: dataSource },
        ],
      }).compile();

      projectsService = module.get(ProjectsService);
    });

    it('create: transactional CREATE audit for PROJECT', async () => {
      projectRepository.save.mockResolvedValue(mockProjectEntity({ id: 3 }));

      await projectsService.create({ name: 'P', ownerId: 1 }, 1);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.CREATE,
        entityType: AuditEntityType.PROJECT,
        entityId: 3,
        details: expect.objectContaining({ name: 'Sample Project' }),
      });
    });

    it('update: transactional UPDATE audit with changed field details', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 3 }));
      projectRepository.save.mockResolvedValue(
        mockProjectEntity({ id: 3, name: 'Renamed' }),
      );

      await projectsService.update(3, { name: 'Renamed' }, 1);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.PROJECT,
        entityId: 3,
        details: expect.objectContaining({
          name: expect.objectContaining({ before: 'Sample Project', after: 'Renamed' }),
        }),
      });
    });

    it('remove: transactional DELETE audit for PROJECT', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 3 }));
      projectRepository.softDelete.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await projectsService.remove(3, 1);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.DELETE,
        entityType: AuditEntityType.PROJECT,
        entityId: 3,
      });
    });

  });

  describe('TicketsService', () => {
    let ticketsService: TicketsService;
    let ticketRepository: jest.Mocked<Repository<Ticket>>;

    beforeEach(async () => {
      ticketRepository = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        softDelete: jest.fn(),
      } as unknown as jest.Mocked<Repository<Ticket>>;

      ticketRepository.create.mockReturnValue(mockTicketEntity());
      manager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Ticket) {
          return ticketRepository;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as typeof manager.getRepository;

      const module = await Test.createTestingModule({
        providers: [
          TicketsService,
          { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
          {
            provide: ProjectsService,
            useValue: { findOne: jest.fn().mockResolvedValue(mockProjectResponse()) },
          },
          {
            provide: UsersService,
            useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
          },
          { provide: AuditLogService, useValue: auditLogService },
          { provide: DataSource, useValue: dataSource },
        ],
      }).compile();

      ticketsService = module.get(TicketsService);
    });

    it('create: transactional CREATE audit with ticket snapshot details', async () => {
      const saved = mockTicketEntity({ id: 7 });
      ticketRepository.save.mockResolvedValue(saved);

      await ticketsService.create(
        {
          title: 'T',
          status: TicketStatus.TODO,
          priority: TicketPriority.HIGH,
          type: TicketType.BUG,
          projectId: 1,
          assigneeId: 2,
        },
        2,
      );

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TICKET,
        entityId: 7,
        performedBy: 2,
        details: expect.objectContaining({
          title: saved.title,
          status: TicketStatus.TODO,
        }),
      });
    });

    it('update: transactional UPDATE audit with status from/to details', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 7 }));
      ticketRepository.save.mockResolvedValue(
        mockTicketEntity({ id: 7, status: TicketStatus.IN_PROGRESS }),
      );

      await ticketsService.update(
        7,
        { version: 1, status: TicketStatus.IN_PROGRESS },
        2,
      );

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TICKET,
        entityId: 7,
        details: expect.objectContaining({
          from: TicketStatus.TODO,
          to: TicketStatus.IN_PROGRESS,
        }),
      });
    });

    it('remove: transactional DELETE audit with deletedAt detail', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 7 }));
      ticketRepository.softDelete.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await ticketsService.remove(7, 2);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.DELETE,
        entityType: AuditEntityType.TICKET,
        entityId: 7,
        details: expect.objectContaining({ deletedAt: expect.any(String) }),
      });
    });

  });

  describe('CommentsService', () => {
    let commentsService: CommentsService;
    let commentRepository: jest.Mocked<Repository<Comment>>;
    let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
    let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;

    beforeEach(async () => {
      commentRepository = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        remove: jest.fn(),
      } as unknown as jest.Mocked<Repository<Comment>>;

      ticketRepository = {
        findOne: jest.fn().mockResolvedValue(mockTicketEntity({ id: 1 })),
      } as unknown as jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;

      userRepository = {
        findOne: jest.fn().mockResolvedValue(mockUserEntity({ id: 2 })),
        find: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<Pick<Repository<User>, 'findOne' | 'find'>>;

      const mentionRepository = createMockMentionRepository();
      commentRepository.create.mockReturnValue(mockCommentEntity());
      manager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Comment) {
          return commentRepository;
        }
        if (entity === Ticket) {
          return ticketRepository;
        }
        if (entity === User) {
          return userRepository;
        }
        if (entity === CommentMention) {
          return mentionRepository;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as typeof manager.getRepository;

      const module = await Test.createTestingModule({
        providers: [
          CommentsService,
          { provide: getRepositoryToken(Comment), useValue: commentRepository },
          {
            provide: getRepositoryToken(CommentMention),
            useValue: mentionRepository,
          },
          {
            provide: TicketsService,
            useValue: { findOne: jest.fn().mockResolvedValue({ id: 1 }) },
          },
          {
            provide: UsersService,
            useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
          },
          { provide: AuditLogService, useValue: auditLogService },
          { provide: DataSource, useValue: dataSource },
        ],
      }).compile();

      commentsService = module.get(CommentsService);
    });

    it('create: transactional CREATE audit for COMMENT', async () => {
      commentRepository.save.mockResolvedValue(mockCommentEntity({ id: 4 }));

      await commentsService.create(1, { authorId: 2, content: 'Hello' });

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.CREATE,
        entityType: AuditEntityType.COMMENT,
        entityId: 4,
        details: expect.objectContaining({ content: 'Hello', ticketId: 1 }),
      });
    });

    it('update: transactional UPDATE audit with content before/after', async () => {
      commentRepository.findOne.mockResolvedValue(
        mockCommentEntity({ id: 4, content: 'Before' }),
      );
      commentRepository.save.mockResolvedValue(
        mockCommentEntity({ id: 4, content: 'After' }),
      );

      await commentsService.update(4, { version: 1, content: 'After' }, 2);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.COMMENT,
        entityId: 4,
        details: {
          content: { before: 'Before', after: 'After' },
        },
      });
    });

    it('remove: transactional DELETE audit for COMMENT', async () => {
      commentRepository.findOne.mockResolvedValue(mockCommentEntity({ id: 4 }));
      commentRepository.remove.mockResolvedValue(mockCommentEntity({ id: 4 }));

      await commentsService.remove(4, 2);

      expectTransactionalAuditCall(auditLogService, manager, {
        action: AuditAction.DELETE,
        entityType: AuditEntityType.COMMENT,
        entityId: 4,
      });
    });

    it('update: does not write audit when comment is missing', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(
        commentsService.update(99, { version: 1, content: 'x' }, 2),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
