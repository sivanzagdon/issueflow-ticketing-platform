import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { Ticket } from './entities/ticket.entity';

export type AutoEscalationSummary = {
  escalated: number;
  markedOverdue: number;
  skipped: number;
};

const NEXT_PRIORITY: Record<TicketPriority, TicketPriority | null> = {
  [TicketPriority.LOW]: TicketPriority.MEDIUM,
  [TicketPriority.MEDIUM]: TicketPriority.HIGH,
  [TicketPriority.HIGH]: TicketPriority.CRITICAL,
  [TicketPriority.CRITICAL]: null,
};

export type EscalationAction =
  | { type: 'skip' }
  | {
      type: 'escalate';
      previousPriority: TicketPriority;
      newPriority: TicketPriority;
      isOverdue: boolean;
      reason: string;
    }
  | {
      type: 'markOverdue';
      previousPriority: TicketPriority;
      newPriority: TicketPriority.CRITICAL;
      isOverdue: true;
      reason: string;
    };

export function evaluateTicketEscalation(
  ticket: Ticket,
  now: Date,
): EscalationAction {
  if (ticket.dueDate == null) {
    return { type: 'skip' };
  }
  if (ticket.dueDate.getTime() >= now.getTime()) {
    return { type: 'skip' };
  }
  if (ticket.status === TicketStatus.DONE) {
    return { type: 'skip' };
  }
  if (ticket.deletedAt != null) {
    return { type: 'skip' };
  }
  if (ticket.priority === TicketPriority.CRITICAL && ticket.isOverdue) {
    return { type: 'skip' };
  }

  if (ticket.priority === TicketPriority.CRITICAL) {
    return {
      type: 'markOverdue',
      previousPriority: ticket.priority,
      newPriority: TicketPriority.CRITICAL,
      isOverdue: true,
      reason: 'due date exceeded',
    };
  }

  const newPriority = NEXT_PRIORITY[ticket.priority];
  if (newPriority == null) {
    return { type: 'skip' };
  }

  return {
    type: 'escalate',
    previousPriority: ticket.priority,
    newPriority,
    isOverdue: ticket.isOverdue,
    reason: 'due date exceeded',
  };
}
