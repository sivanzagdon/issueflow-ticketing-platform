import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';
import { mockCommentEntity } from './testing/comment.fixtures';
import {
  CommentMentionEntityStub,
  createMockMentionRepository,
} from './testing/mention.fixtures';

type CommentWithVersion = Comment & { version: number };

/**
 * Slice 11 — mention persistence transactional boundaries with comment mutations.
 */
describe('CommentsService mentions — transaction (Slice 11)', () => {
  let service: CommentsService;
  let commentRepository: jest.Mocked<
    Pick<Repository<Comment>, 'create' | 'save' | 'findOne'>
  >;
  let mentionRepository: jest.Mocked<
    Pick<Repository<CommentMentionEntityStub>, 'save' | 'delete'>
  >;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne' | 'find'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    const transactionalManager = ctx.manager;

    commentRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<Comment>, 'create' | 'save' | 'findOne'>
    >;

    mentionRepository = createMockMentionRepository();

    ticketRepository = { findOne: jest.fn() };
    userRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([
        mockUserEntity({ id: 10, username: 'john', fullName: 'John Smith' }),
      ]),
    };

    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

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
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  it('persists mentions inside dataSource.transaction on create', async () => {
    const dto: CreateCommentDto = { authorId: 2, content: 'Hi @john' };
    const entity = mockCommentEntity({ content: dto.content });
    ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 2 }));
    commentRepository.create.mockReturnValue(entity);
    commentRepository.save.mockResolvedValue(entity);

    await service.create(1, dto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mentionRepository.save).toHaveBeenCalled();
  });

  it('rolls back comment create when mention persistence fails', async () => {
    const dto: CreateCommentDto = { authorId: 2, content: 'Hi @john' };
    const entity = mockCommentEntity({ content: dto.content });
    ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 2 }));
    commentRepository.create.mockReturnValue(entity);
    commentRepository.save.mockResolvedValue(entity);
    mentionRepository.save.mockRejectedValue(new Error('mention insert failed'));

    await expect(service.create(1, dto)).rejects.toThrow('mention insert failed');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('rolls back comment update when mention sync fails', async () => {
    const existing: CommentWithVersion = {
      ...mockCommentEntity({ id: 4, content: 'Before' }),
      version: 1,
    };
    commentRepository.findOne.mockResolvedValue(existing);
    commentRepository.save.mockImplementation(async (entity: CommentWithVersion) => ({
      ...entity,
      version: entity.version + 1,
    }));
    mentionRepository.delete.mockRejectedValue(new Error('mention delete failed'));

    const dto: UpdateCommentDto = { version: 1, content: 'After @john' };

    await expect(service.update(4, dto, 2)).rejects.toThrow('mention delete failed');
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('does not leave partial mention associations after failed create', async () => {
    mentionRepository.save.mockRejectedValue(new Error('mention insert failed'));
    const dto: CreateCommentDto = { authorId: 2, content: '@john' };
    ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 2 }));
    commentRepository.create.mockReturnValue(mockCommentEntity());
    commentRepository.save.mockResolvedValue(mockCommentEntity());

    await expect(service.create(1, dto)).rejects.toThrow();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('still writes Audit Log on successful create with mentions', async () => {
    const dto: CreateCommentDto = { authorId: 2, content: '@john' };
    ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
    userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 2 }));
    commentRepository.create.mockReturnValue(mockCommentEntity());
    commentRepository.save.mockResolvedValue(mockCommentEntity());

    await service.create(1, dto);

    expect(auditLogService.record).toHaveBeenCalledTimes(1);
  });
});
