import {
  FileValidator,
  MaxFileSizeValidator,
} from '@nestjs/common';

/** 10 MB — same cap as attachment uploads. */
export const TICKET_IMPORT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** MIME types commonly used for CSV uploads. */
const CSV_ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/csv',
  'text/comma-separated-values',
]);

/** Generic mimetypes accepted only when the filename ends with `.csv`. */
const CSV_GENERIC_MIME_TYPES = new Set([
  'application/octet-stream',
  'text/plain',
]);

const CSV_EXTENSION_PATTERN = /\.csv$/i;

function normalizeMimeType(mimetype: string | undefined): string {
  return (mimetype ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function hasCsvExtension(filename: string | undefined): boolean {
  return CSV_EXTENSION_PATTERN.test(filename ?? '');
}

/**
 * Returns true when the upload is CSV-compatible (mimetype and/or `.csv` extension).
 */
export function isAllowedCsvUpload(file: Express.Multer.File): boolean {
  const mime = normalizeMimeType(file.mimetype);
  const filename = file.originalname ?? '';

  if (!mime && !hasCsvExtension(filename)) {
    return false;
  }

  if (mime.startsWith('image/')) {
    return false;
  }
  if (mime === 'application/pdf' || mime === 'application/json') {
    return false;
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return false;
  }

  if (CSV_ALLOWED_MIME_TYPES.has(mime)) {
    return true;
  }

  if (CSV_GENERIC_MIME_TYPES.has(mime) && hasCsvExtension(filename)) {
    return true;
  }

  return hasCsvExtension(filename) && mime.length === 0;
}

/**
 * ParseFilePipe validator — rejects non-CSV uploads before service parsing.
 */
export class TicketCsvFileValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    return !!file && isAllowedCsvUpload(file);
  }

  buildErrorMessage(file?: Express.Multer.File): string {
    const mime = file?.mimetype ?? 'unknown';
    return `Validation failed (file must be a CSV upload, received ${mime})`;
  }
}

export const ticketImportUploadValidators = (): [
  MaxFileSizeValidator,
  TicketCsvFileValidator,
] => [
  new MaxFileSizeValidator({ maxSize: TICKET_IMPORT_MAX_FILE_SIZE }),
  new TicketCsvFileValidator(),
];
