import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { Ticket } from '../tickets/entities/ticket.entity';
import { UsersService } from '../users/users.service';
import { mockProjectEntity } from './testing/project.fixtures';
import {
  expectProjectWorkloadListShape,
  mockAdminUser,
  mockDeveloperUsers,
  ProjectsServiceSlice15,
} from './testing/workload.fixtures';
import { Project } from './entities/project.entity';
import { User } from '../users/entities/user.entity';
import { ProjectsService } from './projects.service';

/**
 * Slice 15 — project workload calculation (README).
 */
describe('ProjectsService getProjectWorkload (Slice 15)', () => {
  let service: ProjectsServiceSlice15;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;

  beforeEach(async () => {
    projectRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Project>>;
    userRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    ticketRepository = {
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map([[Project, projectRepository]]),
          ),
        },
      ],
    }).compile();

    service = module.get(ProjectsService) as ProjectsServiceSlice15;
  });

  it('requires project to exist', async () => {
    projectRepository.findOne.mockResolvedValue(null);

    await expect(service.getProjectWorkload(404)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns only DEVELOPER users with README workload shape', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    userRepository.find.mockResolvedValue(mockDeveloperUsers());
    ticketRepository.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);

    const result = await service.getProjectWorkload(5);

    expectProjectWorkloadListShape(result);
    expect(userRepository.find).toHaveBeenCalledWith({
      where: { role: UserRole.DEVELOPER },
      order: { createdAt: 'ASC' },
    });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.username)).toBe(true);
  });

  it('excludes ADMIN users from workload list', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    userRepository.find.mockResolvedValue(mockDeveloperUsers());

    await service.getProjectWorkload(5);

    const findArgs = userRepository.find.mock.calls[0]?.[0] as {
      where: { role: UserRole };
    };
    expect(findArgs.where.role).toBe(UserRole.DEVELOPER);
    expect(findArgs.where.role).not.toBe(UserRole.ADMIN);
    expect(mockAdminUser().role).toBe(UserRole.ADMIN);
  });

  it('counts only non-DONE tickets for the requested project', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    userRepository.find.mockResolvedValue([mockDeveloperUsers()[0]]);
    ticketRepository.count.mockResolvedValue(3);

    await service.getProjectWorkload(5);

    expect(ticketRepository.count).toHaveBeenCalledWith({
      where: {
        projectId: 5,
        assigneeId: 10,
        status: Not(TicketStatus.DONE),
        deletedAt: IsNull(),
      },
    });
  });

  it('excludes soft-deleted tickets from open counts', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    userRepository.find.mockResolvedValue([mockDeveloperUsers()[0]]);
    ticketRepository.count.mockResolvedValue(1);

    await service.getProjectWorkload(5);

    expect(ticketRepository.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: IsNull() }),
      }),
    );
  });

  it('scopes ticket counts to the requested project only', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 7 }));
    userRepository.find.mockResolvedValue([mockDeveloperUsers()[0]]);
    ticketRepository.count.mockResolvedValue(0);

    await service.getProjectWorkload(7);

    expect(ticketRepository.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 7 }),
      }),
    );
  });

  it('sorts workload ascending by openTicketCount', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    userRepository.find.mockResolvedValue(mockDeveloperUsers());
    ticketRepository.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);

    const result = await service.getProjectWorkload(5);

    expect(result[0].openTicketCount).toBeLessThanOrEqual(
      result[1].openTicketCount,
    );
    expect(result[0]).toEqual(
      expect.objectContaining({ userId: 11, openTicketCount: 1 }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ userId: 10, openTicketCount: 4 }),
    );
  });

  it('returns empty array when no developers exist', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    userRepository.find.mockResolvedValue([]);

    const result = await service.getProjectWorkload(5);

    expect(result).toEqual([]);
    expect(ticketRepository.count).not.toHaveBeenCalled();
  });
});
