import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import {
  overdueTicket,
  SLICE16_FIXED_NOW,
  TicketsServiceSlice16,
} from './testing/escalation.fixtures';
import { Ticket } from './entities/ticket.entity';
import { createEscalationTestModule } from './testing/escalation-test.helpers';

/**
 * Slice 16 — manual priority change resets auto-escalation state (README).
 */
describe('TicketsService manual priority reset (Slice 16)', () => {
  it('clears isOverdue when priority is manually updated', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    const existing = overdueTicket({
      id: 20,
      priority: TicketPriority.CRITICAL,
      isOverdue: true,
      version: 1,
    });
    const updated = { ...existing, priority: TicketPriority.HIGH, isOverdue: false };
    ticketRepository.findOne.mockResolvedValue(existing);
    ticketRepository.save.mockResolvedValue(updated);

    const result = await service.update(20, {
      version: 1,
      priority: TicketPriority.HIGH,
    });

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: TicketPriority.HIGH,
        isOverdue: false,
      }),
    );
    expect(result.isOverdue).toBe(false);
  });

  it('re-evaluates escalation from the new manual priority on the next cycle', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({
        id: 21,
        priority: TicketPriority.LOW,
        isOverdue: false,
      }),
    ]);
    ticketRepository.save.mockImplementation(async (entity) => entity as Ticket);

    const summary = await (
      service as TicketsServiceSlice16
    ).runAutoEscalation(SLICE16_FIXED_NOW);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: TicketPriority.MEDIUM }),
    );
    expect(summary.escalated).toBe(1);
  });

  it('escalates from manually lowered priority after a prior CRITICAL overdue state', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    const manuallyReset = overdueTicket({
      id: 22,
      priority: TicketPriority.MEDIUM,
      isOverdue: false,
      version: 2,
    });
    ticketRepository.findOne.mockResolvedValue(manuallyReset);
    ticketRepository.save.mockResolvedValue({
      ...manuallyReset,
      priority: TicketPriority.HIGH,
    });
    ticketRepository.find.mockResolvedValue([manuallyReset]);

    await (service as TicketsServiceSlice16).runAutoEscalation(SLICE16_FIXED_NOW);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: TicketPriority.HIGH }),
    );
  });

  it('does not clear isOverdue when updating non-priority fields only', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    const existing = overdueTicket({
      id: 23,
      priority: TicketPriority.CRITICAL,
      isOverdue: true,
      version: 1,
    });
    ticketRepository.findOne.mockResolvedValue(existing);
    ticketRepository.save.mockResolvedValue({
      ...existing,
      title: 'Renamed only',
    });

    await service.update(23, { version: 1, title: 'Renamed only' });

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isOverdue: true,
        priority: TicketPriority.CRITICAL,
      }),
    );
  });
});
