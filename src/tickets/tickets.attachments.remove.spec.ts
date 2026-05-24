import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import {
  AUDIT_ENTITY_TICKET_ATTACHMENT,
  createMockAttachmentRepository,
  mockAttachmentEntity,
  TicketAttachmentEntityStub,
  TicketsServiceSlice13,
} from './testing/attachment.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 13 — remove ticket attachment metadata.
 */
describe('TicketsService removeAttachment (Slice 13)', () => {
  let service: TicketsServiceSlice13;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let attachmentRepository: ReturnType<typeof createMockAttachmentRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: ReturnType<
    typeof createMockTransactionalContext
  >['manager'];

  beforeEach(async () => {
    ticketRepository = { findOne: jest.fn() };
    attachmentRepository = createMockAttachmentRepository();
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepository;
      }
      if (entity === TicketAttachmentEntityStub) {
        return attachmentRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

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
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice13;
  });

  const activeTicket = (id: number) =>
    mockTicketEntity({ id, deletedAt: null });

  it('soft-deletes attachment metadata only', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.findOne.mockResolvedValue(
      mockAttachmentEntity({ id: 5, ticketId: 12, filename: 'keep-me.png' }),
    );

    await service.removeAttachment(12, 5, 2);

    expect(attachmentRepository.softDelete).toHaveBeenCalledWith(5);
    expect(attachmentRepository.delete).not.toHaveBeenCalled();
  });

  it('runs removal inside dataSource.transaction', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.findOne.mockResolvedValue(
      mockAttachmentEntity({ id: 5, ticketId: 12 }),
    );

    await service.removeAttachment(12, 5, 2);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('writes DELETE audit for TICKET_ATTACHMENT inside the same transaction', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.findOne.mockResolvedValue(
      mockAttachmentEntity({ id: 5, ticketId: 12, filename: 'doc.pdf' }),
    );

    await service.removeAttachment(12, 5, 2);

    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.DELETE,
      entityType: AUDIT_ENTITY_TICKET_ATTACHMENT,
      entityId: 5,
      performedBy: 2,
      actorType: AuditActor.USER,
      details: expect.objectContaining({
        ticketId: 12,
        attachmentId: 5,
        filename: 'doc.pdf',
      }),
    });
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
  });

  it('requires attachment to belong to the ticket', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.findOne.mockResolvedValue(
      mockAttachmentEntity({ id: 5, ticketId: 99 }),
    );

    await expect(service.removeAttachment(12, 5, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(attachmentRepository.softDelete).not.toHaveBeenCalled();
  });

  it('fails with NotFoundException when attachment is missing', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.findOne.mockResolvedValue(null);

    await expect(service.removeAttachment(12, 999, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(attachmentRepository.softDelete).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('rejects removal when ticket is soft-deleted', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 12, deletedAt: new Date() }),
    );

    await expect(service.removeAttachment(12, 5, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(attachmentRepository.findOne).not.toHaveBeenCalled();
  });

  it('deleting one attachment does not remove other attachments', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.findOne.mockResolvedValue(
      mockAttachmentEntity({ id: 1, ticketId: 12 }),
    );

    await service.removeAttachment(12, 1, 2);

    expect(attachmentRepository.softDelete).toHaveBeenCalledWith(1);
    expect(attachmentRepository.softDelete).toHaveBeenCalledTimes(1);
  });

  it('rolls back when audit write fails after soft delete', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.findOne.mockResolvedValue(
      mockAttachmentEntity({ id: 5, ticketId: 12, filename: 'x.png' }),
    );
    auditLogService.record.mockRejectedValue(new Error('audit failed'));

    await expect(service.removeAttachment(12, 5, 2)).rejects.toThrow('audit failed');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
