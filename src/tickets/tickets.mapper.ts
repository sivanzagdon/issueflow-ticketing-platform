import { TicketStateHistoryEntry } from '../audit-log/audit-log.types';
import { Ticket } from './entities/ticket.entity';

export type TicketResponse = Pick<
  Ticket,
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'type'
  | 'projectId'
  | 'assigneeId'
  | 'dueDate'
  | 'isOverdue'
  | 'version'
>;

export type TicketDetailResponse = TicketResponse & {
  stateHistory: TicketStateHistoryEntry[];
};

export function toTicketResponse(ticket: Ticket): TicketResponse {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    projectId: ticket.projectId,
    assigneeId: ticket.assigneeId,
    dueDate: ticket.dueDate,
    isOverdue: ticket.isOverdue,
    version: ticket.version,
  };
}
