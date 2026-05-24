import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { Ticket } from './entities/ticket.entity';

/** README export CSV header (exact order). */
export const TICKET_EXPORT_CSV_HEADER =
  'id,title,description,status,priority,type,assigneeId';

/** Import CSV header — projectId comes from multipart form field. */
export const TICKET_IMPORT_CSV_HEADER =
  'title,description,status,priority,type,assigneeId';

export const TICKET_EXPORT_COLUMNS = [
  'id',
  'title',
  'description',
  'status',
  'priority',
  'type',
  'assigneeId',
] as const;

export const TICKET_IMPORT_COLUMNS = [
  'title',
  'description',
  'status',
  'priority',
  'type',
  'assigneeId',
] as const;

export type TicketImportCsvRow = {
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  assigneeId: string;
};

export type TicketImportRowError = {
  row: number;
  message: string;
};

/** README POST /tickets/import response shape. */
export type TicketImportResult = {
  created: number;
  failed: number;
  errors: TicketImportRowError[];
};

export function exportTicketsToCsv(tickets: Ticket[]): string {
  const records = tickets.map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
    description: ticket.description ?? '',
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    assigneeId: ticket.assigneeId ?? '',
  }));

  if (records.length === 0) {
    return `${TICKET_EXPORT_CSV_HEADER}\n`;
  }

  return stringify(records, {
    header: true,
    columns: [...TICKET_EXPORT_COLUMNS],
  });
}

export function parseTicketImportCsv(buffer: Buffer): TicketImportCsvRow[] {
  const content = buffer.toString('utf8');
  if (!content.trim()) {
    return [];
  }

  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: false,
      bom: true,
    }) as Record<string, string>[];
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to parse CSV file';
    throw new Error(message);
  }

  return records.map((record) => ({
    title: record.title ?? '',
    description: record.description ?? '',
    status: record.status ?? '',
    priority: record.priority ?? '',
    type: record.type ?? '',
    assigneeId: record.assigneeId ?? '',
  }));
}

export function isTicketStatusValue(value: string): value is TicketStatus {
  return Object.values(TicketStatus).includes(value as TicketStatus);
}

export function isTicketPriorityValue(value: string): value is TicketPriority {
  return Object.values(TicketPriority).includes(value as TicketPriority);
}

export function isTicketTypeValue(value: string): value is TicketType {
  return Object.values(TicketType).includes(value as TicketType);
}
