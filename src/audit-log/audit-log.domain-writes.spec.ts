import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { mockDataSourceWithRepositories } from './testing/transaction-test.helpers';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { CommentsService } from '../comments/comments.service';
import { CommentMention } from '../comments/entities/comment-mention.entity';
import { Comment } from '../comments/entities/comment.entity';
import {
  createMockMentionRepository,
} from '../comments/testing/mention.fixtures';
import { Project } from '../projects/entities/project.entity';
import { ProjectsService } from '../projects/projects.service';
import { mockProjectEntity } from '../projects/testing/project.fixtures';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { Ticket } from '../tickets/entities/ticket.entity';
import { ticketAttachmentRepositoryProvider } from '../tickets/testing/attachment.fixtures';
import { ticketDependencyRepositoryProvider } from '../tickets/testing/dependency.fixtures';
import { TicketsService } from '../tickets/tickets.service';
import { mockCommentEntity } from '../comments/testing/comment.fixtures';
import { mockTicketEntity } from '../tickets/testing/ticket.fixtures';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { mockUserEntity, mockUserResponse } from '../users/testing/user.fixtures';
import { AuditLogService } from './audit-log.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));

/**
 * Contract: state-changing domain services append audit logs via AuditLogService.record().
 * Fails until each service injects and calls AuditLogService.
 */
describe('Audit log domain write integration (contract)', () => {
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;

  beforeEach(() => {
    auditLogService = {
      record: jest.fn().mockResolvedValue({ id: 1 }),
    };
  });

  const expectUserAudit = (
    action: AuditAction,
    extra?: Record<string, unknown>,
  ) => {
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action,
        entityType: AuditEntityType.USER,
        actorType: AuditActor.USER,
        performedBy: expect.any(Number),
        ...extra,
      }),
      expect.objectContaining({ getRepository: expect.any(Function) }),
    );
  };

  describe('UsersService', () => {
    let usersService: UsersService;

    beforeEach(async () => {
      const userRepository = {
        create: jest.fn().mockReturnValue(mockUserEntity()),
        save: jest.fn().mockResolvedValue(mockUserEntity({ id: 9 })),
        find: jest.fn(),
        findOne: jest.fn().mockResolvedValue(mockUserEntity({ id: 9 })),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
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
          {
            provide: DataSource,
            useValue: mockDataSourceWithRepositories(
              new Map([[User, userRepository]]),
            ),
          },
        ],
      }).compile();
      usersService = module.get(UsersService);
    });

    it('creating user records CREATE audit for USER entity', async () => {
      await usersService.create({
        username: 'audit-user',
        email: 'audit@example.com',
        fullName: 'Audit User',
        role: UserRole.DEVELOPER,
        password: 'password12',
      });
      expectUserAudit(AuditAction.CREATE);
    });

    it('updating user records UPDATE audit for USER entity', async () => {
      await usersService.update(9, { fullName: 'Updated' });
      expectUserAudit(AuditAction.UPDATE, { entityId: 9 });
    });

    it('deleting user records DELETE audit for USER entity', async () => {
      await usersService.remove(9);
      expectUserAudit(AuditAction.DELETE, { entityId: 9 });
    });
  });

  describe('ProjectsService', () => {
    let projectsService: ProjectsService;

    beforeEach(async () => {
      const projectRepository = {
        create: jest.fn().mockReturnValue(mockProjectEntity()),
        save: jest.fn().mockResolvedValue(mockProjectEntity({ id: 3 })),
        find: jest.fn(),
        findOne: jest.fn().mockResolvedValue(mockProjectEntity({ id: 3 })),
        softDelete: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          ProjectsService,
          { provide: getRepositoryToken(Project), useValue: projectRepository },
          {
            provide: UsersService,
            useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
          },
          { provide: AuditLogService, useValue: auditLogService },
          {
            provide: DataSource,
            useValue: mockDataSourceWithRepositories(
              new Map([[Project, projectRepository]]),
            ),
          },
        ],
      }).compile();
      projectsService = module.get(ProjectsService);
    });

    it('creating project records CREATE audit for PROJECT entity', async () => {
      await projectsService.create({ name: 'P', ownerId: 1 });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: AuditEntityType.PROJECT,
        }),
        expect.anything(),
      );
    });

    it('updating project records UPDATE audit for PROJECT entity', async () => {
      await projectsService.update(3, { name: 'Renamed' });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.PROJECT,
          entityId: 3,
        }),
        expect.anything(),
      );
    });

    it('deleting project records DELETE audit for PROJECT entity', async () => {
      await projectsService.remove(3);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DELETE,
          entityType: AuditEntityType.PROJECT,
          entityId: 3,
        }),
        expect.anything(),
      );
    });
  });

  describe('TicketsService', () => {
    let ticketsService: TicketsService;

    beforeEach(async () => {
      const ticketRepository = {
        create: jest.fn().mockReturnValue(mockTicketEntity()),
        save: jest
          .fn()
          .mockImplementation((ticket: Ticket) => Promise.resolve(ticket)),
        find: jest.fn(),
        findOne: jest.fn().mockResolvedValue(mockTicketEntity({ id: 7 })),
        softDelete: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          TicketsService,
          { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
          ticketDependencyRepositoryProvider(),
          ticketAttachmentRepositoryProvider(),
          {
            provide: ProjectsService,
            useValue: {
              findOne: jest.fn().mockResolvedValue(mockProjectResponse()),
            },
          },
          {
            provide: UsersService,
            useValue: {
              findOne: jest.fn().mockResolvedValue(mockUserResponse()),
            },
          },
          { provide: AuditLogService, useValue: auditLogService },
          {
            provide: DataSource,
            useValue: mockDataSourceWithRepositories(
              new Map([[Ticket, ticketRepository]]),
            ),
          },
        ],
      }).compile();
      ticketsService = module.get(TicketsService);
    });

    it('creating ticket records CREATE audit for TICKET entity', async () => {
      await ticketsService.create({
        title: 'T',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId: 1,
        assigneeId: 2,
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: AuditEntityType.TICKET,
        }),
        expect.anything(),
      );
    });

    it('updating ticket records UPDATE audit for TICKET entity', async () => {
      await ticketsService.update(7, { version: 1, title: 'Renamed' });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.TICKET,
          entityId: 7,
        }),
        expect.anything(),
      );
    });

    it('updating ticket status records UPDATE audit with from/to in details', async () => {
      await ticketsService.update(7, {
        version: 1,
        status: TicketStatus.IN_PROGRESS,
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: AuditEntityType.TICKET,
          action: AuditAction.UPDATE,
          details: expect.objectContaining({
            from: TicketStatus.TODO,
            to: TicketStatus.IN_PROGRESS,
          }),
        }),
        expect.anything(),
      );
    });

    it('deleting ticket records DELETE audit for TICKET entity', async () => {
      await ticketsService.remove(7);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DELETE,
          entityType: AuditEntityType.TICKET,
          entityId: 7,
        }),
        expect.anything(),
      );
    });
  });

  describe('CommentsService', () => {
    let commentsService: CommentsService;

    beforeEach(async () => {
      const commentRepository = {
        create: jest.fn().mockReturnValue(mockCommentEntity()),
        save: jest.fn().mockResolvedValue(mockCommentEntity({ id: 4 })),
        find: jest.fn(),
        findOne: jest.fn().mockResolvedValue(mockCommentEntity({ id: 4 })),
        remove: jest.fn(),
      };
      const ticketRepository = {
        findOne: jest.fn().mockResolvedValue(mockTicketEntity({ id: 1 })),
      };
      const userRepository = {
        findOne: jest.fn().mockResolvedValue(mockUserEntity({ id: 2 })),
        find: jest.fn().mockResolvedValue([]),
      };
      const mentionRepository = createMockMentionRepository();
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
          {
            provide: DataSource,
            useValue: mockDataSourceWithRepositories(
              new Map<unknown, object>([
                [Comment, commentRepository],
                [CommentMention, mentionRepository],
                [Ticket, ticketRepository],
                [User, userRepository],
              ]),
            ),
          },
        ],
      }).compile();
      commentsService = module.get(CommentsService);
    });

    it('creating comment records CREATE audit for COMMENT entity', async () => {
      await commentsService.create(1, {
        authorId: 2,
        content: 'Hello',
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: AuditEntityType.COMMENT,
        }),
        expect.anything(),
      );
    });

    it('updating comment records UPDATE audit for COMMENT entity', async () => {
      await commentsService.update(1, 4, { version: 1, content: 'Edited' });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.COMMENT,
          entityId: 4,
        }),
        expect.anything(),
      );
    });

    it('deleting comment records DELETE audit for COMMENT entity', async () => {
      await commentsService.remove(1, 4);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DELETE,
          entityType: AuditEntityType.COMMENT,
          entityId: 4,
        }),
        expect.anything(),
      );
    });
  });
});
