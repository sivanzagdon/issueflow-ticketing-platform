import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketType } from '../../common/enums/ticket-type.enum';
import {
  TICKET_EXPORT_CSV_HEADER,
  TICKET_IMPORT_CSV_HEADER,
} from '../ticket-csv';

export { TICKET_EXPORT_CSV_HEADER, TICKET_IMPORT_CSV_HEADER };

import type { TicketImportResult, TicketImportRowError } from '../ticket-csv';

export type { TicketImportResult, TicketImportRowError };

export const mockImportResult = (
  overrides: Partial<TicketImportResult> = {},
): TicketImportResult => ({
  created: 0,
  failed: 0,
  errors: [],
  ...overrides,
});

export function expectTicketImportResultShape(body: TicketImportResult): void {
  expect(body).toEqual(
    expect.objectContaining({
      created: expect.any(Number),
      failed: expect.any(Number),
      errors: expect.any(Array),
    }),
  );
  expect(body).not.toHaveProperty('tickets');
  expect(body).not.toHaveProperty('success');
  for (const error of body.errors) {
    expect(error).toEqual(
      expect.objectContaining({
        row: expect.any(Number),
        message: expect.any(String),
      }),
    );
  }
}

/** Escape a single CSV field per RFC-style quoting used by csv-stringify. */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildExportCsvRow(fields: {
  id: number;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  assigneeId: number | null;
}): string {
  return [
    fields.id,
    escapeCsvField(fields.title),
    escapeCsvField(fields.description ?? ''),
    fields.status,
    fields.priority,
    fields.type,
    fields.assigneeId ?? '',
  ].join(',');
}

export function buildExportCsv(
  rows: Parameters<typeof buildExportCsvRow>[0][],
): string {
  const lines = [TICKET_EXPORT_CSV_HEADER, ...rows.map(buildExportCsvRow)];
  return `${lines.join('\n')}\n`;
}

export function buildImportCsv(
  dataRows: string[],
  header: string = TICKET_IMPORT_CSV_HEADER,
): string {
  return `${[header, ...dataRows].join('\n')}\n`;
}

export function buildImportCsvRow(fields: {
  title: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  assigneeId?: number | '' | null;
}): string {
  return [
    escapeCsvField(fields.title),
    escapeCsvField(fields.description ?? ''),
    fields.status,
    fields.priority,
    fields.type,
    fields.assigneeId === null || fields.assigneeId === undefined || fields.assigneeId === ''
      ? ''
      : String(fields.assigneeId),
  ].join(',');
}

export const mockCsvFile = (
  content: string,
  filename = 'tickets.csv',
): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: filename,
    encoding: '7bit',
    mimetype: 'text/csv',
    size: Buffer.byteLength(content),
    buffer: Buffer.from(content),
  }) as Express.Multer.File;

/** Slice 14 service surface — not implemented yet. */
export type TicketsServiceSlice14 = import('../tickets.service').TicketsService & {
  exportTicketsCsv(projectId: number): Promise<string>;
  importTicketsFromCsv(
    projectId: number,
    file: Express.Multer.File,
    performedBy?: number,
  ): Promise<TicketImportResult>;
};
