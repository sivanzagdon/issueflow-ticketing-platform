import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import {
  createMockAttachmentRepository,
  expectTicketAttachmentListShape,
  mockAttachmentEntity,
  TicketAttachmentEntityStub,
  TicketsServiceSlice13,
} from './testing/attachment.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 13 — list ticket attachments (README direct array).
 */
describe('TicketsService getAttachments (Slice 13)', () => {
  let service: TicketsServiceSlice13;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let attachmentRepository: ReturnType<typeof createMockAttachmentRepository>;

  beforeEach(async () => {
    ticketRepository = { findOne: jest.fn() };
    attachmentRepository = createMockAttachmentRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        {
          provide: getRepositoryToken(TicketAttachmentEntityStub),
          useValue: attachmentRepository,
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
              [TicketAttachmentEntityStub, attachmentRepository],
            ]),
          ),
        },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice13;
  });

  it('returns attachments as a direct array per README', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 12, deletedAt: null }),
    );
    attachmentRepository.find.mockResolvedValue([
      mockAttachmentEntity({
        id: 2,
        ticketId: 12,
        filename: 'b.png',
        contentType: 'image/png',
      }),
      mockAttachmentEntity({
        id: 1,
        ticketId: 12,
        filename: 'a.png',
        contentType: 'image/jpeg',
      }),
    ]);

    const result = await service.getAttachments(12);

    expectTicketAttachmentListShape(result);
    expect(result).toEqual([
      {
        id: 1,
        ticketId: 12,
        filename: 'a.png',
        contentType: 'image/jpeg',
      },
      {
        id: 2,
        ticketId: 12,
        filename: 'b.png',
        contentType: 'image/png',
      },
    ]);
  });

  it('queries attachments sorted by id ascending at the database layer', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 12, deletedAt: null }),
    );
    attachmentRepository.find.mockResolvedValue([]);

    await service.getAttachments(12);

    expect(attachmentRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ticketId: 12, deletedAt: IsNull() }),
        order: { id: 'ASC' },
      }),
    );
  });

  it('returns only attachments belonging to the requested ticket', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 12, deletedAt: null }),
    );
    attachmentRepository.find.mockResolvedValue([
      mockAttachmentEntity({ id: 1, ticketId: 12 }),
    ]);

    const result = await service.getAttachments(12);

    expect(attachmentRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ticketId: 12 }) }),
    );
    expect(result.every((item) => item.ticketId === 12)).toBe(true);
  });

  it('returns an empty array when the ticket has no attachments', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 12, deletedAt: null }),
    );
    attachmentRepository.find.mockResolvedValue([]);

    const result = await service.getAttachments(12);

    expect(result).toEqual([]);
  });

  it('excludes soft-deleted attachments from the list', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 12, deletedAt: null }),
    );
    attachmentRepository.find.mockResolvedValue([
      mockAttachmentEntity({ id: 1, ticketId: 12, deletedAt: null }),
    ]);

    await service.getAttachments(12);

    expect(attachmentRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: IsNull() }),
      }),
    );
  });

  it('fails with NotFoundException when ticket does not exist', async () => {
    ticketRepository.findOne.mockResolvedValue(null);

    await expect(service.getAttachments(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(attachmentRepository.find).not.toHaveBeenCalled();
  });
});
