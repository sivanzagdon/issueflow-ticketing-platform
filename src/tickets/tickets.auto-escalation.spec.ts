import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import {
  expectAutoEscalationSummaryShape,
  overdueTicket,
  SLICE16_FIXED_NOW,
  SLICE16_FUTURE_DUE,
  TicketsServiceSlice16,
} from './testing/escalation.fixtures';
import { Ticket } from './entities/ticket.entity';
import { createEscalationTestModule } from './testing/escalation-test.helpers';

/**
 * Slice 16 — automatic ticket priority escalation (README).
 */
describe('TicketsService runAutoEscalation (Slice 16)', () => {
  const runEscalation = async (
    service: TicketsServiceSlice16,
    now = SLICE16_FIXED_NOW,
  ) => service.runAutoEscalation(now);

  it('escalates overdue LOW ticket to MEDIUM', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    const ticket = overdueTicket({ id: 1, priority: TicketPriority.LOW });
    ticketRepository.find.mockResolvedValue([ticket]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    const summary = await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.TODO,
      }),
    );
    expect(summary.escalated).toBe(1);
  });

  it('escalates overdue MEDIUM ticket to HIGH', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 2, priority: TicketPriority.MEDIUM }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: TicketPriority.HIGH }),
    );
  });

  it('escalates overdue HIGH ticket to CRITICAL', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 3, priority: TicketPriority.HIGH }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: TicketPriority.CRITICAL }),
    );
  });

  it('does not escalate overdue CRITICAL ticket further', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 4, priority: TicketPriority.CRITICAL }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    const summary = await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: TicketPriority.CRITICAL }),
    );
    expect(summary.escalated).toBe(0);
    expect(summary.markedOverdue).toBe(1);
  });

  it('sets isOverdue true for overdue CRITICAL ticket', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 5, priority: TicketPriority.CRITICAL, isOverdue: false }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: TicketPriority.CRITICAL,
        isOverdue: true,
      }),
    );
  });

  it('ignores tickets that are not yet overdue', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({
        id: 6,
        priority: TicketPriority.LOW,
        dueDate: SLICE16_FUTURE_DUE,
      }),
    ]);

    const summary = await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).not.toHaveBeenCalled();
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
    expect(summary.escalated).toBe(0);
  });

  it('ignores DONE tickets', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 7, status: TicketStatus.DONE }),
    ]);

    const summary = await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).not.toHaveBeenCalled();
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
  });

  it('ignores tickets without dueDate', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 8, dueDate: null }),
    ]);

    const summary = await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).not.toHaveBeenCalled();
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
  });

  it('does not change ticket status during escalation', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    const status = TicketStatus.IN_PROGRESS;
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 9, priority: TicketPriority.LOW, status }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status }),
    );
  });

  describe('escalation idempotency and multi-cycle behavior', () => {
    it('promotes at most one priority level per ticket in a single run', async () => {
      const { service, ticketRepository } = await createEscalationTestModule();
      ticketRepository.find.mockResolvedValue([
        overdueTicket({ id: 10, priority: TicketPriority.LOW }),
      ]);
      ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

      await runEscalation(service as TicketsServiceSlice16);

      expect(ticketRepository.save).toHaveBeenCalledTimes(1);
      expect(ticketRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ priority: TicketPriority.MEDIUM }),
      );
      expect(ticketRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ priority: TicketPriority.HIGH }),
      );
    });

    it('does not double-escalate the same ticket within one run', async () => {
      const { service, ticketRepository } = await createEscalationTestModule();
      ticketRepository.find.mockResolvedValue([
        overdueTicket({ id: 10, priority: TicketPriority.MEDIUM }),
      ]);
      ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

      const summary = await runEscalation(service as TicketsServiceSlice16);

      expect(ticketRepository.save).toHaveBeenCalledTimes(1);
      expect(ticketRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ priority: TicketPriority.HIGH }),
      );
      expect(summary.escalated).toBe(1);
    });

    it('allows a later escalation cycle to promote a still-overdue ticket again', async () => {
      const { service, ticketRepository } = await createEscalationTestModule();
      ticketRepository.find
        .mockResolvedValueOnce([
          overdueTicket({ id: 10, priority: TicketPriority.LOW }),
        ])
        .mockResolvedValueOnce([
          overdueTicket({ id: 10, priority: TicketPriority.MEDIUM }),
        ]);
      ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

      const first = await runEscalation(service as TicketsServiceSlice16);
      const second = await runEscalation(service as TicketsServiceSlice16);

      expect(ticketRepository.save).toHaveBeenCalledTimes(2);
      expect(ticketRepository.save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ priority: TicketPriority.MEDIUM }),
      );
      expect(ticketRepository.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ priority: TicketPriority.HIGH }),
      );
      expect(first.escalated).toBe(1);
      expect(second.escalated).toBe(1);
    });

    it('does not promote CRITICAL priority on a later cycle', async () => {
      const { service, ticketRepository } = await createEscalationTestModule();
      ticketRepository.find.mockResolvedValue([
        overdueTicket({
          id: 10,
          priority: TicketPriority.CRITICAL,
          isOverdue: true,
        }),
      ]);
      ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

      const summary = await runEscalation(service as TicketsServiceSlice16);

      expect(ticketRepository.save).not.toHaveBeenCalled();
      expect(summary.escalated).toBe(0);
      expect(summary.skipped).toBeGreaterThanOrEqual(1);
    });

    it('is idempotent for CRITICAL overdue tickets already marked on re-run', async () => {
      const { service, ticketRepository } = await createEscalationTestModule();
      const criticalOverdue = overdueTicket({
        id: 10,
        priority: TicketPriority.CRITICAL,
        isOverdue: false,
      });
      ticketRepository.find
        .mockResolvedValueOnce([criticalOverdue])
        .mockResolvedValueOnce([
          { ...criticalOverdue, isOverdue: true },
        ]);
      ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

      const first = await runEscalation(service as TicketsServiceSlice16);
      const second = await runEscalation(service as TicketsServiceSlice16);

      expect(ticketRepository.save).toHaveBeenCalledTimes(1);
      expect(ticketRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: TicketPriority.CRITICAL,
          isOverdue: true,
        }),
      );
      expect(first.markedOverdue).toBe(1);
      expect(first.escalated).toBe(0);
      expect(second.escalated).toBe(0);
      expect(second.markedOverdue).toBe(0);
      expect(second.skipped).toBeGreaterThanOrEqual(1);
    });
  });

  it('processes all eligible overdue tickets in one run', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 11, priority: TicketPriority.LOW }),
      overdueTicket({ id: 12, priority: TicketPriority.MEDIUM }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    const summary = await runEscalation(service as TicketsServiceSlice16);

    expect(ticketRepository.save).toHaveBeenCalledTimes(2);
    expect(summary.escalated).toBe(2);
  });

  it('returns escalation summary with escalated, markedOverdue, and skipped counts', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 13, priority: TicketPriority.LOW }),
      overdueTicket({ id: 14, priority: TicketPriority.CRITICAL }),
      overdueTicket({
        id: 15,
        priority: TicketPriority.HIGH,
        dueDate: SLICE16_FUTURE_DUE,
      }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    const summary = await runEscalation(service as TicketsServiceSlice16);

    expectAutoEscalationSummaryShape(summary);
    expect(summary.escalated).toBe(1);
    expect(summary.markedOverdue).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});
