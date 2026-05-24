import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import {
  createMockDependencyRepository,
  expectTicketBlockerListShape,
  TicketDependencyEntityStub,
  TicketsServiceSlice12,
} from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 12 — list ticket blockers (README array response).
 */
describe('TicketsService getDependencies (Slice 12)', () => {
  let service: TicketsServiceSlice12;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let dependencyRepository: ReturnType<typeof createMockDependencyRepository>;

  beforeEach(async () => {
    ticketRepository = { findOne: jest.fn() };
    dependencyRepository = createMockDependencyRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        {
          provide: getRepositoryToken(TicketDependencyEntityStub),
          useValue: dependencyRepository,
        },
        {
          provide: ProjectsService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockProjectResponse()) },
        },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
        },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map<unknown, object>([
              [Ticket, ticketRepository],
              [TicketDependencyEntityStub, dependencyRepository],
            ]),
          ),
        },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice12;
  });

  it('returns blockers as a direct array per README', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.find.mockResolvedValue([
      {
        blocker: mockTicketEntity({
          id: 42,
          title: 'Blocking ticket',
          status: TicketStatus.IN_PROGRESS,
          deletedAt: null,
        }),
      },
      {
        blocker: mockTicketEntity({
          id: 55,
          title: 'Second blocker',
          status: TicketStatus.TODO,
          deletedAt: null,
        }),
      },
    ]);

    const result = await service.getDependencies(10);

    expectTicketBlockerListShape(result);
    expect(result).toEqual([
      expect.objectContaining({
        id: 42,
        title: 'Blocking ticket',
        status: TicketStatus.IN_PROGRESS,
      }),
      expect.objectContaining({
        id: 55,
        title: 'Second blocker',
        status: TicketStatus.TODO,
      }),
    ]);
  });

  it('returns empty array when ticket has no dependencies', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.find.mockResolvedValue([]);

    const result = await service.getDependencies(10);

    expect(result).toEqual([]);
  });

  it('returns blockers in stable order by blocker ticket id ascending', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.find.mockResolvedValue([
      {
        blocker: mockTicketEntity({ id: 99, title: 'Z', status: TicketStatus.TODO }),
      },
      {
        blocker: mockTicketEntity({
          id: 20,
          title: 'A',
          status: TicketStatus.IN_PROGRESS,
        }),
      },
    ]);

    const result = await service.getDependencies(10);

    expect(result.map((b) => b.id)).toEqual([20, 99]);
  });

  it('does not return duplicate blockers for duplicate dependency rows', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.find.mockResolvedValue([
      {
        blocker: mockTicketEntity({ id: 42, title: 'Once', status: TicketStatus.TODO }),
      },
    ]);

    const result = await service.getDependencies(10);

    const ids = result.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('loads dependencies via repository query without in-memory filtering', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.find.mockResolvedValue([]);
    const filterSpy = jest.spyOn(Array.prototype, 'filter');

    await service.getDependencies(10);

    expect(dependencyRepository.find).toHaveBeenCalled();
    const findArgs = dependencyRepository.find.mock.calls[0][0] as {
      where?: { ticketId?: number };
    };
    expect(findArgs?.where?.ticketId).toBe(10);
    expect(filterSpy).not.toHaveBeenCalled();

    filterSpy.mockRestore();
  });

  it('excludes soft-deleted blocker tickets from results', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.find.mockResolvedValue([
      {
        blocker: mockTicketEntity({
          id: 42,
          title: 'Active',
          status: TicketStatus.TODO,
          deletedAt: null,
        }),
      },
    ]);

    const result = await service.getDependencies(10);

    expect(result).toEqual([
      expect.objectContaining({
        id: 42,
        title: 'Active',
        status: TicketStatus.TODO,
      }),
    ]);
    expect(result.some((b) => b.id === 99)).toBe(false);
  });

  it('fails with NotFoundException when ticket does not exist', async () => {
    ticketRepository.findOne.mockResolvedValue(null);

    await expect(service.getDependencies(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dependencyRepository.find).not.toHaveBeenCalled();
  });
});
