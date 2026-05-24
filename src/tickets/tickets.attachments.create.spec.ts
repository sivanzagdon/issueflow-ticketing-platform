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
  expectTicketAttachmentResponseShape,
  mockAttachmentEntity,
  mockAttachmentResponse,
  mockUploadFile,
  TicketAttachmentEntityStub,
  TicketsServiceSlice13,
} from './testing/attachment.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 13 — create ticket attachment metadata (README contract).
 */
describe('TicketsService createAttachment (Slice 13)', () => {
  let service: TicketsServiceSlice13;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let attachmentRepository: ReturnType<typeof createMockAttachmentRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: ReturnType<
    typeof createMockTransactionalContext
  >['manager'];

  const uploadFile = mockUploadFile();

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

  it('persists attachment metadata for an active ticket', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.save.mockResolvedValue(
      mockAttachmentEntity({
        id: 1,
        ticketId: 12,
        filename: uploadFile.originalname,
        contentType: uploadFile.mimetype,
      }),
    );

    await service.createAttachment(12, uploadFile, 2);

    expect(attachmentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 12,
        filename: 'screenshot.png',
        contentType: 'image/png',
      }),
    );
    expect(attachmentRepository.save).toHaveBeenCalled();
  });

  it('returns README attachment response shape with stable field names', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.save.mockResolvedValue(
      mockAttachmentEntity({
        id: 7,
        ticketId: 12,
        filename: 'screenshot.png',
        contentType: 'image/png',
      }),
    );

    const result = await service.createAttachment(12, uploadFile, 2);

    expectTicketAttachmentResponseShape(result);
    expect(result).toEqual(mockAttachmentResponse({ id: 7, ticketId: 12 }));
    expect(Object.keys(result).sort()).toEqual(
      ['contentType', 'filename', 'id', 'ticketId'].sort(),
    );
  });

  it('allows duplicate filenames on the same ticket', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.save
      .mockResolvedValueOnce(
        mockAttachmentEntity({ id: 1, ticketId: 12, filename: 'dup.png' }),
      )
      .mockResolvedValueOnce(
        mockAttachmentEntity({ id: 2, ticketId: 12, filename: 'dup.png' }),
      );

    const dupFile = mockUploadFile({ originalname: 'dup.png', mimetype: 'image/png' });
    await service.createAttachment(12, dupFile, 2);
    await service.createAttachment(12, dupFile, 2);

    expect(attachmentRepository.save).toHaveBeenCalledTimes(2);
  });

  it('runs attachment creation inside dataSource.transaction', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.save.mockResolvedValue(
      mockAttachmentEntity({ id: 1, ticketId: 12 }),
    );

    await service.createAttachment(12, uploadFile, 2);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('writes CREATE audit for TICKET_ATTACHMENT inside the same transaction', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.save.mockResolvedValue(
      mockAttachmentEntity({ id: 99, ticketId: 12, filename: 'screenshot.png' }),
    );

    await service.createAttachment(12, uploadFile, 2);

    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.CREATE,
      entityType: AUDIT_ENTITY_TICKET_ATTACHMENT,
      entityId: 99,
      performedBy: 2,
      actorType: AuditActor.USER,
      details: expect.objectContaining({
        ticketId: 12,
        attachmentId: 99,
        filename: 'screenshot.png',
      }),
    });
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
  });

  it('fails with NotFoundException when ticket does not exist', async () => {
    ticketRepository.findOne.mockResolvedValue(null);

    await expect(service.createAttachment(99, uploadFile, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(attachmentRepository.save).not.toHaveBeenCalled();
  });

  it('rejects attachment creation when ticket is soft-deleted', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 12, deletedAt: new Date() }),
    );

    await expect(service.createAttachment(12, uploadFile, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(attachmentRepository.save).not.toHaveBeenCalled();
  });

  it('rolls back attachment creation when audit write fails', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(12));
    attachmentRepository.save.mockResolvedValue(
      mockAttachmentEntity({ id: 1, ticketId: 12 }),
    );
    auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

    await expect(service.createAttachment(12, uploadFile, 2)).rejects.toThrow(
      'audit insert failed',
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not write audit when ticket validation fails', async () => {
    ticketRepository.findOne.mockResolvedValue(null);

    await expect(service.createAttachment(99, uploadFile, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
