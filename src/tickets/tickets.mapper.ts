import { TicketStateHistoryEntry } from '../audit-log/audit-log.types';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketAttachment } from './entities/ticket-attachment.entity';
import { Ticket } from './entities/ticket.entity';

export type TicketAttachmentResponse = {
  id: number;
  ticketId: number;
  filename: string;
  contentType: string;
};

export type TicketBlockerSummary = {
  id: number;
  title: string;
  status: TicketStatus;
};

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

export function toAttachmentResponse(
  attachment: TicketAttachment,
): TicketAttachmentResponse {
  return {
    id: attachment.id,
    ticketId: attachment.ticketId,
    filename: attachment.filename,
    contentType: attachment.contentType,
  };
}

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
