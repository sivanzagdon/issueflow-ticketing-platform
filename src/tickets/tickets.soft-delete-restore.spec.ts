import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { TicketsService } from './tickets.service';

/** Slice 9 service surface — not implemented yet. */
type TicketsServiceSlice9 = TicketsService & {
  findAllDeleted(projectId: number): Promise<unknown[]>;
  restore(id: number, performedBy?: number): Promise<unknown>;
};

describe('TicketsService soft delete and restore (slice 9)', () => {
  let service: TicketsServiceSlice9;
  let ticketRepository: jest.Mocked<
    Pick<
      Repository<Ticket>,
      'find' | 'findOne' | 'softDelete' | 'restore' | 'delete' | 'count'
    >
  >;
  let auditLogService: jest.Mocked<
    Pick<AuditLogService, 'record' | 'buildTicketStateHistory'>
  >;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: ReturnType<
    typeof createMockTransactionalContext
  >['manager'];

  beforeEach(async () => {
    ticketRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    };

    auditLogService = {
      record: jest.fn().mockResolvedValue({ id: 1 }),
      buildTicketStateHistory: jest.fn().mockResolvedValue([]),
    };
    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
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

    service = module.get(TicketsService) as TicketsServiceSlice9;
  });

  describe('remove (soft delete only)', () => {
    it('soft-deletes via repository.softDelete and never hard-deletes', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 7 }));
      ticketRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.remove(7, 2);

      expect(ticketRepository.softDelete).toHaveBeenCalledWith({ id: 7 });
      expect(ticketRepository.delete).not.toHaveBeenCalled();
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('records DELETE audit for TICKET with deletedAt inside transaction', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 7 }));
      ticketRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.remove(7, 2);

      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.DELETE,
        entityType: AuditEntityType.TICKET,
        entityId: 7,
        performedBy: 2,
        actorType: AuditActor.USER,
        details: expect.objectContaining({ deletedAt: expect.any(String) }),
      });
    });

    it('does not write audit when softDelete fails inside transaction', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 7 }));
      ticketRepository.softDelete.mockRejectedValue(new Error('delete failed'));

      await expect(service.remove(7, 2)).rejects.toThrow('delete failed');
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('propagates error when audit write fails so soft delete rolls back', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ id: 7 }));
      ticketRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.remove(7, 2)).rejects.toThrow('audit insert failed');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when deleting a missing ticket', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(ticketRepository.softDelete).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when deleting an already soft-deleted ticket', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(7, 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(ticketRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('standard query visibility', () => {
    it('findAll excludes soft-deleted tickets by default', async () => {
      ticketRepository.find.mockResolvedValue([mockTicketEntity({ id: 1 })]);

      await service.findAll(5);

      expect(ticketRepository.find).toHaveBeenCalledWith({
        where: { projectId: 5 },
      });
      expect(ticketRepository.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });

    it('findOne throws NotFoundException when ticket is soft-deleted', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(7)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAllDeleted (GET /tickets/deleted)', () => {
    it('returns only soft-deleted tickets for the project', async () => {
      const deleted = mockTicketEntity({
        id: 3,
        projectId: 5,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      ticketRepository.find.mockResolvedValue([deleted]);

      const result = await service.findAllDeleted(5);

      expect(ticketRepository.find).toHaveBeenCalledWith({
        where: { projectId: 5, deletedAt: Not(IsNull()) },
        withDeleted: true,
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 3, projectId: 5 });
    });
  });

  describe('restore (POST /tickets/:ticketId/restore)', () => {
    it('restores a soft-deleted ticket and records RESTORE audit atomically', async () => {
      const restored = mockTicketEntity({ id: 7, deletedAt: null });
      ticketRepository.findOne
        .mockResolvedValueOnce(mockTicketEntity({ id: 7, deletedAt: new Date() }))
        .mockResolvedValueOnce(restored);
      ticketRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      const result = await service.restore(7, 2);

      expect(ticketRepository.restore).toHaveBeenCalledWith({ id: 7 });
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.RESTORE,
        entityType: AuditEntityType.TICKET,
        entityId: 7,
        performedBy: 2,
        actorType: AuditActor.USER,
      });
      expect(result).toMatchObject({ id: 7 });
    });

    it('restored ticket is visible via findOne and hidden from findAllDeleted', async () => {
      const active = mockTicketEntity({ id: 7, deletedAt: null });
      ticketRepository.findOne
        .mockResolvedValueOnce(mockTicketEntity({ id: 7, deletedAt: new Date() }))
        .mockResolvedValueOnce(active);
      ticketRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await service.restore(7, 2);

      ticketRepository.findOne.mockResolvedValue(active);
      await expect(service.findOne(7)).resolves.toMatchObject({ id: 7 });

      ticketRepository.find.mockResolvedValue([]);
      await expect(service.findAllDeleted(1)).resolves.toEqual([]);
    });

    it('throws when restoring a ticket that is not soft-deleted', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ id: 7, deletedAt: null }),
      );

      await expect(service.restore(7, 2)).rejects.toThrow();
      expect(ticketRepository.restore).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when restoring a missing ticket', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.restore(999, 2)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rolls back restore when audit record fails', async () => {
      ticketRepository.findOne
        .mockResolvedValueOnce(mockTicketEntity({ id: 7, deletedAt: new Date() }))
        .mockResolvedValueOnce(mockTicketEntity({ id: 7, deletedAt: null }));
      ticketRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.restore(7, 2)).rejects.toThrow('audit insert failed');
    });
  });
});
