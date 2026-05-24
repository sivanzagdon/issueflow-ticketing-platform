import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketAttachmentRepositoryProvider } from './testing/attachment.fixtures';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import {
  buildExportCsvRow,
  TICKET_EXPORT_CSV_HEADER,
  TicketsServiceSlice14,
} from './testing/ticket-csv.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 14 — export tickets to CSV (README).
 */
describe('TicketsService exportTicketsCsv (Slice 14)', () => {
  let service: TicketsServiceSlice14;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'find'>>;
  let projectsService: jest.Mocked<Pick<ProjectsService, 'findOne'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;

  beforeEach(async () => {
    ticketRepository = { find: jest.fn() };
    projectsService = { findOne: jest.fn().mockResolvedValue(mockProjectResponse({ id: 5 })) };
    auditLogService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        ticketAttachmentRepositoryProvider(),
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice14;
  });

  it('requires project to exist before export', async () => {
    projectsService.findOne.mockRejectedValue(
      new NotFoundException('Project 99 not found'),
    );

    await expect(service.exportTicketsCsv(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ticketRepository.find).not.toHaveBeenCalled();
  });

  it('exports only active tickets for the requested project', async () => {
    ticketRepository.find.mockResolvedValue([
      mockTicketEntity({ id: 1, projectId: 5, deletedAt: null }),
      mockTicketEntity({ id: 2, projectId: 5, deletedAt: null }),
    ]);

    await service.exportTicketsCsv(5);

    expect(projectsService.findOne).toHaveBeenCalledWith(5);
    expect(ticketRepository.find).toHaveBeenCalledWith({
      where: { projectId: 5, deletedAt: IsNull() },
      order: { id: 'ASC' },
    });
  });

  it('returns CSV with exact README header', async () => {
    ticketRepository.find.mockResolvedValue([]);

    const csv = await service.exportTicketsCsv(5);

    expect(csv.split('\n')[0]).toBe(TICKET_EXPORT_CSV_HEADER);
  });

  it('returns header-only CSV when project has no tickets', async () => {
    ticketRepository.find.mockResolvedValue([]);

    const csv = await service.exportTicketsCsv(5);

    const lines = csv.trim().split('\n');
    expect(lines).toEqual([TICKET_EXPORT_CSV_HEADER]);
  });

  it('escapes commas inside field values', async () => {
    ticketRepository.find.mockResolvedValue([
      mockTicketEntity({
        id: 10,
        projectId: 5,
        title: 'Fix, login',
        description: 'Needs, work',
      }),
    ]);

    const csv = await service.exportTicketsCsv(5);

    expect(csv).toContain('"Fix, login"');
    expect(csv).toContain('"Needs, work"');
  });

  it('escapes double quotes inside field values', async () => {
    ticketRepository.find.mockResolvedValue([
      mockTicketEntity({
        id: 11,
        projectId: 5,
        title: 'Say "hello"',
        description: 'Quoted "value"',
      }),
    ]);

    const csv = await service.exportTicketsCsv(5);

    expect(csv).toContain('"Say ""hello"""');
    expect(csv).toContain('"Quoted ""value"""');
  });

  it('exports null assigneeId as empty field', async () => {
    ticketRepository.find.mockResolvedValue([
      mockTicketEntity({
        id: 12,
        projectId: 5,
        assigneeId: null,
      }),
    ]);

    const csv = await service.exportTicketsCsv(5);

    const dataLine = csv.trim().split('\n')[1];
    expect(dataLine.endsWith(',')).toBe(true);
    expect(dataLine).toBe(
      buildExportCsvRow({
        id: 12,
        title: 'Fix login bug',
        description: 'Description',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        assigneeId: null,
      }),
    );
  });

  it('serializes only tickets returned for the requested project', async () => {
    ticketRepository.find.mockResolvedValue([
      mockTicketEntity({
        id: 7,
        projectId: 5,
        title: 'Project A ticket',
        assigneeId: 3,
      }),
    ]);

    const csv = await service.exportTicketsCsv(5);
    const lines = csv.trim().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('7,');
    expect(lines[1]).toContain('Project A ticket');
  });

  it('does not write Audit Log records during export', async () => {
    ticketRepository.find.mockResolvedValue([mockTicketEntity({ id: 1, projectId: 5 })]);

    await service.exportTicketsCsv(5);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
