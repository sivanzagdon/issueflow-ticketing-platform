import { EntityManager } from 'typeorm';
import { mockAuditLogResponse } from '../audit-log/testing/audit-log.fixtures';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { Ticket } from './entities/ticket.entity';
import {
  AUDIT_ACTION_AUTO_ESCALATE,
  expectAutoEscalateAuditPayload,
  overdueTicket,
  SLICE16_FIXED_NOW,
  TicketsServiceSlice16,
} from './testing/escalation.fixtures';
import { createEscalationTestModule } from './testing/escalation-test.helpers';

/**
 * Slice 16 — AUTO_ESCALATE audit behavior (transactional with ticket update).
 */
describe('TicketsService auto-escalation audit (Slice 16)', () => {
  it('writes AUTO_ESCALATE audit with SYSTEM actor for each escalated ticket', async () => {
    const { service, ticketRepository, auditLogService, dataSource } =
      await createEscalationTestModule();
    const ctx = createMockTransactionalContext();
    dataSource.transaction = ctx.dataSource.transaction;
    const transactionalManager = ctx.manager;
    const ticketRepo = {
      find: jest.fn().mockResolvedValue([
        overdueTicket({ id: 30, priority: TicketPriority.LOW }),
      ]),
      save: jest
        .fn()
        .mockResolvedValue(
          overdueTicket({ id: 30, priority: TicketPriority.MEDIUM }),
        ),
    };
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepo;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 30, priority: TicketPriority.LOW }),
    ]);

    await (service as TicketsServiceSlice16).runAutoEscalation(SLICE16_FIXED_NOW);

    const autoEscalateCalls = auditLogService.record.mock.calls.filter(
      ([input]) => input.action === AUDIT_ACTION_AUTO_ESCALATE,
    );
    expect(autoEscalateCalls).toHaveLength(1);
    expectAutoEscalateAuditPayload(autoEscalateCalls[0][0] as Record<string, unknown>);
    expectTransactionalAuditCall(
      auditLogService.record,
      expect.objectContaining({
        action: AUDIT_ACTION_AUTO_ESCALATE,
        entityType: AuditEntityType.TICKET,
        entityId: 30,
      }),
    );
  });

  it('includes previousPriority, newPriority, ticket id, and reason in audit details', async () => {
    const { service, ticketRepository, auditLogService } =
      await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 31, priority: TicketPriority.HIGH }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    await (service as TicketsServiceSlice16).runAutoEscalation(SLICE16_FIXED_NOW);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 31,
        details: expect.objectContaining({
          previousPriority: TicketPriority.HIGH,
          newPriority: TicketPriority.CRITICAL,
          reason: expect.any(String),
        }),
      }),
      expect.anything(),
    );
  });

  it('rolls back ticket priority update when AUTO_ESCALATE audit write fails', async () => {
    const { service, ticketRepository, auditLogService, dataSource } =
      await createEscalationTestModule();
    const ctx = createMockTransactionalContext();
    dataSource.transaction = ctx.dataSource.transaction;
    const transactionalManager: EntityManager = ctx.manager;
    const ticketRepo = {
      find: jest.fn().mockResolvedValue([
        overdueTicket({ id: 32, priority: TicketPriority.LOW }),
      ]),
      save: jest.fn().mockResolvedValue(
        overdueTicket({ id: 32, priority: TicketPriority.MEDIUM }),
      ),
    };
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepo;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 32, priority: TicketPriority.LOW }),
    ]);
    auditLogService.record
      .mockResolvedValueOnce(mockAuditLogResponse({ id: 1 }))
      .mockRejectedValueOnce(new Error('audit failed'));

    await expect(
      (service as TicketsServiceSlice16).runAutoEscalation(SLICE16_FIXED_NOW),
    ).rejects.toThrow();

    expect(ticketRepo.save).toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTION_AUTO_ESCALATE }),
      expect.anything(),
    );
  });

  it('does not write AUTO_ESCALATE audit for ignored tickets', async () => {
    const { service, ticketRepository, auditLogService } =
      await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 33, dueDate: null }),
    ]);

    await (service as TicketsServiceSlice16).runAutoEscalation(SLICE16_FIXED_NOW);

    const autoEscalateCalls = auditLogService.record.mock.calls.filter(
      ([input]) => input.action === AUDIT_ACTION_AUTO_ESCALATE,
    );
    expect(autoEscalateCalls).toHaveLength(0);
  });
});
