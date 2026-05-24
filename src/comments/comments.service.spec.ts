import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { mockTicketEntity, mockTicketResponse } from '../tickets/testing/ticket.fixtures';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketsService } from '../tickets/tickets.service';
import { mockUserEntity } from '../users/testing/user.fixtures';
import { User } from '../users/entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UsersService } from '../users/users.service';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';
import {
  mockCommentEntity,
  mockCommentResponse,
} from './testing/comment.fixtures';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepository: jest.Mocked<
    Pick<
      Repository<Comment>,
      'create' | 'save' | 'find' | 'findOne' | 'remove'
    >
  >;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let ticketsService: jest.Mocked<Pick<TicketsService, 'findOne'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const baseCreateDto: CreateCommentDto = {
    authorId: 2,
    content: 'First post!',
  };

  beforeEach(async () => {
    commentRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        Repository<Comment>,
        'create' | 'save' | 'find' | 'findOne' | 'remove'
      >
    >;

    ticketRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };
    ticketsService = { findOne: jest.fn() };
    usersService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepository },
        { provide: TicketsService, useValue: ticketsService },
        { provide: UsersService, useValue: usersService },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn().mockResolvedValue({ id: 1 }) },
        },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map<unknown, object>([
              [Comment, commentRepository],
              [Ticket, ticketRepository],
              [User, userRepository],
            ]),
          ),
        },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  describe('create', () => {
    it('creates comment when ticket exists and author exists', async () => {
      const entity = mockCommentEntity();
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
      userRepository.findOne.mockResolvedValue(mockUserEntity({ id: 2 }));
      commentRepository.create.mockReturnValue(entity);
      commentRepository.save.mockResolvedValue(entity);

      const result = await service.create(1, baseCreateDto);

      expect(ticketRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: baseCreateDto.authorId },
      });
      expect(commentRepository.create).toHaveBeenCalled();
      expect(commentRepository.save).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: entity.id,
        ticketId: 1,
        authorId: baseCreateDto.authorId,
        content: baseCreateDto.content,
      });
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect(result).not.toHaveProperty('mentionedUsers');
    });

    it('rejects create when ticket does not exist with NotFoundException', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.create(99, baseCreateDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(commentRepository.save).not.toHaveBeenCalled();
    });

    it('rejects create when author does not exist with NotFoundException', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 1 }));
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.create(1, baseCreateDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(commentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findByTicket', () => {
    it('returns comments for a ticket', async () => {
      ticketsService.findOne.mockResolvedValue({
        ...mockTicketResponse({ id: 5 }),
        stateHistory: [],
      });
      commentRepository.find.mockResolvedValue([
        mockCommentEntity({ id: 1, ticketId: 5 }),
        mockCommentEntity({ id: 2, ticketId: 5, content: 'Second' }),
      ]);

      const result = await service.findByTicket(5);

      expect(ticketsService.findOne).toHaveBeenCalledWith(5);
      expect(commentRepository.find).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject(mockCommentResponse({ ticketId: 5 }));
    });

    it('rejects missing ticket with NotFoundException', async () => {
      ticketsService.findOne.mockRejectedValue(
        new NotFoundException('Ticket 404 not found'),
      );

      await expect(service.findByTicket(404)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(commentRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('changes comment content', async () => {
      const existing = mockCommentEntity();
      const updated = mockCommentEntity({
        content: 'Edited',
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      const dto: UpdateCommentDto = { version: 1, content: 'Edited' };
      commentRepository.findOne.mockResolvedValue(existing);
      commentRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, dto);

      expect(commentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(commentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Edited' }),
      );
      expect(result.content).toBe('Edited');
    });

    it('throws NotFoundException when updating a missing comment', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, { version: 1, content: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(commentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes existing comment', async () => {
      commentRepository.findOne.mockResolvedValue(mockCommentEntity());
      commentRepository.remove.mockResolvedValue(mockCommentEntity());

      await service.remove(1);

      expect(commentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(commentRepository.remove).toHaveBeenCalled();
    });

    it('throws NotFoundException when removing a missing comment', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(commentRepository.remove).not.toHaveBeenCalled();
    });
  });
});
