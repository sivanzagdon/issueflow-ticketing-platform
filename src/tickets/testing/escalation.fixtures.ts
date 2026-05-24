import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditActor } from '../../common/enums/audit-actor.enum';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { Ticket } from '../entities/ticket.entity';
import type { AutoEscalationSummary } from '../ticket-escalation';
import { mockTicketEntity } from './ticket.fixtures';

/** README Slice 16 — system auto-escalation audit action. */
export const AUDIT_ACTION_AUTO_ESCALATE = AuditAction.AUTO_ESCALATE;

/** Fixed clock for deterministic escalation tests. */
export const SLICE16_FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

export const SLICE16_PAST_DUE = new Date('2026-06-01T00:00:00.000Z');

export const SLICE16_FUTURE_DUE = new Date('2026-07-01T00:00:00.000Z');

export type { AutoEscalationSummary } from '../ticket-escalation';

export const expectAutoEscalationSummaryShape = (
  summary: AutoEscalationSummary,
): void => {
  expect(summary).toEqual(
    expect.objectContaining({
      escalated: expect.any(Number),
      markedOverdue: expect.any(Number),
      skipped: expect.any(Number),
    }),
  );
  expect(Object.keys(summary).sort()).toEqual([
    'escalated',
    'markedOverdue',
    'skipped',
  ]);
};

export const expectAutoEscalateAuditPayload = (
  payload: Record<string, unknown>,
): void => {
  expect(payload).toEqual(
    expect.objectContaining({
      action: AUDIT_ACTION_AUTO_ESCALATE,
      actorType: AuditActor.SYSTEM,
      performedBy: null,
      entityId: expect.any(Number),
      details: expect.objectContaining({
        previousPriority: expect.any(String),
        newPriority: expect.any(String),
        reason: expect.any(String),
      }),
    }),
  );
};

export const overdueTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  mockTicketEntity({
    dueDate: SLICE16_PAST_DUE,
    isOverdue: false,
    status: TicketStatus.TODO,
    deletedAt: null,
    ...overrides,
  });

/** Slice 16 service surface — not implemented yet. */
export type TicketsServiceSlice16 = import('../tickets.service').TicketsService & {
  runAutoEscalation(now?: Date): Promise<AutoEscalationSummary>;
};
