import {
  isAllowedCsvUpload,
  TicketCsvFileValidator,
} from './ticket-import-upload.config';

const mockUpload = (
  overrides: Partial<Express.Multer.File> & {
    mimetype: string;
    originalname?: string;
  },
): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'tickets.csv',
    encoding: '7bit',
    size: 10,
    buffer: Buffer.from('title,description,status,priority,type,assigneeId\n'),
    ...overrides,
  }) as Express.Multer.File;

describe('ticket import upload validation (Slice 14)', () => {
  describe('isAllowedCsvUpload', () => {
    it.each([
      ['text/csv', 'import.csv'],
      ['application/vnd.ms-excel', 'export.csv'],
      ['application/csv', 'data.csv'],
      ['application/octet-stream', 'tickets.csv'],
      ['text/plain', 'tickets.csv'],
    ])('accepts %s with filename %s', (mimetype, originalname) => {
      expect(
        isAllowedCsvUpload(mockUpload({ mimetype, originalname })),
      ).toBe(true);
    });

    it.each([
      ['image/png', 'screenshot.png'],
      ['application/pdf', 'doc.pdf'],
      ['application/json', 'data.json'],
      ['text/plain', 'notes.txt'],
      [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'book.xlsx',
      ],
    ])('rejects %s with filename %s', (mimetype, originalname) => {
      expect(
        isAllowedCsvUpload(mockUpload({ mimetype, originalname })),
      ).toBe(false);
    });
  });

  describe('TicketCsvFileValidator', () => {
    const validator = new TicketCsvFileValidator();

    it('accepts valid CSV uploads', () => {
      expect(
        validator.isValid(mockUpload({ mimetype: 'text/csv' })),
      ).toBe(true);
    });

    it('rejects invalid uploads with a clear message', () => {
      const file = mockUpload({
        mimetype: 'image/png',
        originalname: 'bad.png',
      });

      expect(validator.isValid(file)).toBe(false);
      expect(validator.buildErrorMessage(file)).toMatch(/CSV upload/i);
    });
  });
});
