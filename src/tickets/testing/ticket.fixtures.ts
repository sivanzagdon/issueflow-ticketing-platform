import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketType } from '../../common/enums/ticket-type.enum';
import { Ticket } from '../entities/ticket.entity';
import { TicketResponse, toTicketResponse } from '../tickets.mapper';

export const mockTicketEntity = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 1,
  title: 'Fix login bug',
  description: 'Description',
  status: TicketStatus.TODO,
  priority: TicketPriority.HIGH,
  type: TicketType.BUG,
  projectId: 1,
  project: {} as Ticket['project'],
  assigneeId: 2,
  assignee: {} as Ticket['assignee'],
  dueDate: new Date('2026-04-01T00:00:00.000Z'),
  isOverdue: false,
  version: 1,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

export const mockTicketResponse = (
  overrides: Partial<TicketResponse> = {},
): TicketResponse => toTicketResponse(mockTicketEntity(overrides));
