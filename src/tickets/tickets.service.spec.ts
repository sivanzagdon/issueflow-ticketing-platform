import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import {
  mockTicketEntity,
  mockTicketResponse,
} from './testing/ticket.fixtures';
import { TicketsService } from './tickets.service';

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;
  let projectsService: jest.Mocked<Pick<ProjectsService, 'findOne'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const baseCreateDto: CreateTicketDto = {
    title: 'Fix login bug',
    description: 'Description',
    status: TicketStatus.TODO,
    priority: TicketPriority.HIGH,
    type: TicketType.BUG,
    projectId: 1,
    assigneeId: 2,
    dueDate: '2026-04-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    ticketRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;

    projectsService = { findOne: jest.fn() };
    usersService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: usersService },
        {
          provide: AuditLogService,
          useValue: {
            record: jest.fn().mockResolvedValue({ id: 1 }),
            buildTicketStateHistory: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map([[Ticket, ticketRepository]]),
          ),
        },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  describe('create', () => {
    it('creates ticket when project exists', async () => {
      const entity = mockTicketEntity();
      projectsService.findOne.mockResolvedValue(mockProjectResponse());
      usersService.findOne.mockResolvedValue(mockUserResponse());
      ticketRepository.create.mockReturnValue(entity);
      ticketRepository.save.mockResolvedValue(entity);

      const result = await service.create(baseCreateDto);

      expect(projectsService.findOne).toHaveBeenCalledWith(baseCreateDto.projectId);
      expect(usersService.findOne).toHaveBeenCalledWith(baseCreateDto.assigneeId);
      expect(ticketRepository.create).toHaveBeenCalled();
      expect(ticketRepository.save).toHaveBeenCalledWith(entity);
      expect(result).toEqual(mockTicketResponse());
      expect(result.version).toBeDefined();
    });

    it('creates ticket without assignee when assigneeId is omitted', async () => {
      const { assigneeId: _a, ...dto } = baseCreateDto;
      const entity = mockTicketEntity({ assigneeId: null });
      projectsService.findOne.mockResolvedValue(mockProjectResponse());
      ticketRepository.create.mockReturnValue(entity);
      ticketRepository.save.mockResolvedValue(entity);

      await service.create(dto as CreateTicketDto);

      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(ticketRepository.create).toHaveBeenCalled();
      expect(ticketRepository.save).toHaveBeenCalled();
    });

    it('rejects create when project does not exist with NotFoundException', async () => {
      projectsService.findOne.mockRejectedValue(
        new NotFoundException('Project 1 not found'),
      );

      await expect(service.create(baseCreateDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects create when assignee does not exist with NotFoundException', async () => {
      projectsService.findOne.mockResolvedValue(mockProjectResponse());
      usersService.findOne.mockRejectedValue(
        new NotFoundException('User 2 not found'),
      );

      await expect(service.create(baseCreateDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('returns tickets filtered by projectId', async () => {
      ticketRepository.find.mockResolvedValue([
        mockTicketEntity(),
        mockTicketEntity({ id: 2, title: 'Second' }),
      ]);

      const result = await service.findAll(1);

      expect(ticketRepository.find).toHaveBeenCalledWith({
        where: { projectId: 1 },
      });
      expect(result).toHaveLength(2);
      expect(result[0].projectId).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns ticket by id', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity());

      const result = await service.findOne(1);

      expect(ticketRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual({
        ...mockTicketResponse(),
        stateHistory: [],
      });
      expect(result.version).toBe(1);
    });

    it('returns TicketResponse with boolean isOverdue', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ isOverdue: true }),
      );

      const result = await service.findOne(1);

      expect(result).toHaveProperty('isOverdue');
      expect(typeof result.isOverdue).toBe('boolean');
      expect(result.isOverdue).toBe(true);
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates title and description', async () => {
      const existing = mockTicketEntity();
      const updated = mockTicketEntity({
        title: 'New title',
        description: 'New description',
      });
      ticketRepository.findOne.mockResolvedValue(existing);
      ticketRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        version: 1,
        title: 'New title',
        description: 'New description',
      });

      expect(ticketRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New title',
          description: 'New description',
        }),
      );
      expect(result.title).toBe('New title');
    });

    it('updates priority', async () => {
      const existing = mockTicketEntity();
      const updated = mockTicketEntity({ priority: TicketPriority.CRITICAL });
      ticketRepository.findOne.mockResolvedValue(existing);
      ticketRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        version: 1,
        priority: TicketPriority.CRITICAL,
      });

      expect(result.priority).toBe(TicketPriority.CRITICAL);
    });

    it('updates assigneeId', async () => {
      const existing = mockTicketEntity();
      const updated = mockTicketEntity({ assigneeId: 3 });
      ticketRepository.findOne.mockResolvedValue(existing);
      usersService.findOne.mockResolvedValue(mockUserResponse({ id: 3 }));
      ticketRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, { version: 1, assigneeId: 3 });

      expect(usersService.findOne).toHaveBeenCalledWith(3);
      expect(result.assigneeId).toBe(3);
    });

    it('allows forward status transition TODO -> IN_PROGRESS', async () => {
      const existing = mockTicketEntity({ status: TicketStatus.TODO });
      const updated = mockTicketEntity({ status: TicketStatus.IN_PROGRESS });
      ticketRepository.findOne.mockResolvedValue(existing);
      ticketRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        version: 1,
        status: TicketStatus.IN_PROGRESS,
      });

      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('allows forward status transition IN_PROGRESS -> IN_REVIEW', async () => {
      const existing = mockTicketEntity({ status: TicketStatus.IN_PROGRESS });
      const updated = mockTicketEntity({ status: TicketStatus.IN_REVIEW });
      ticketRepository.findOne.mockResolvedValue(existing);
      ticketRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        version: 1,
        status: TicketStatus.IN_REVIEW,
      });

      expect(result.status).toBe(TicketStatus.IN_REVIEW);
    });

    it('allows forward status transition IN_REVIEW -> DONE', async () => {
      const existing = mockTicketEntity({ status: TicketStatus.IN_REVIEW });
      const updated = mockTicketEntity({ status: TicketStatus.DONE });
      ticketRepository.findOne.mockResolvedValue(existing);
      ticketRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        version: 1,
        status: TicketStatus.DONE,
      });

      expect(result.status).toBe(TicketStatus.DONE);
    });

    it('rejects backward status transition', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ status: TicketStatus.IN_PROGRESS }),
      );

      await expect(
        service.update(1, { version: 1, status: TicketStatus.TODO }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects direct status transition IN_PROGRESS -> DONE', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ status: TicketStatus.IN_PROGRESS }),
      );

      await expect(
        service.update(1, { version: 1, status: TicketStatus.DONE }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects backward status transition IN_REVIEW -> IN_PROGRESS', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ status: TicketStatus.IN_REVIEW }),
      );

      await expect(
        service.update(1, { version: 1, status: TicketStatus.IN_PROGRESS }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects skipping lifecycle steps', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ status: TicketStatus.TODO }),
      );

      await expect(
        service.update(1, { version: 1, status: TicketStatus.IN_REVIEW }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.update(1, { version: 1, status: TicketStatus.DONE }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any update when current ticket status is DONE', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ status: TicketStatus.DONE }),
      );

      await expect(
        service.update(1, { version: 1, title: 'No changes allowed' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when updating a missing ticket', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, { version: 1, title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects stale version with ConflictException', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ version: 2 }),
      );

      await expect(
        service.update(1, { version: 1, title: 'Stale' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('succeeds when dto version matches entity version', async () => {
      const existing = mockTicketEntity({ version: 3 });
      const updated = mockTicketEntity({ version: 3, title: 'Aligned' });
      ticketRepository.findOne.mockResolvedValue(existing);
      ticketRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        version: 3,
        title: 'Aligned',
      });

      expect(result.title).toBe('Aligned');
      expect(ticketRepository.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes existing ticket', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity());
      ticketRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.remove(1);

      expect(ticketRepository.softDelete).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws NotFoundException when removing a missing ticket', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
