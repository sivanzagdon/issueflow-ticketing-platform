import { readFileSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { mockUserResponse } from '../users/testing/user.fixtures';
import {
  expectTicketImportResultShape,
  mockCsvFile,
  mockImportResult,
  TicketsServiceSlice14,
} from '../tickets/testing/ticket-csv.fixtures';
import { TicketsController } from '../tickets/tickets.controller';
import { TicketsService } from '../tickets/tickets.service';
import { expectHandlerRoute } from './testing/route-metadata.helpers';

type TicketsControllerSlice14 = TicketsController & {
  exportTickets(
    projectId: number,
  ): Promise<string | { send: (body: string) => void }>;
  importTickets(
    file: Express.Multer.File,
    projectId: number,
    req: { user: { id: number } },
  ): Promise<import('../tickets/testing/ticket-csv.fixtures').TicketImportResult>;
};

/**
 * Slice 14 — ticket import/export API contract (README).
 */
describe('Ticket import/export API contract (Slice 14)', () => {
  describe('TicketsController routes', () => {
    it.each([
      ['exportTickets', RequestMethod.GET, 'tickets/export'],
      ['importTickets', RequestMethod.POST, 'tickets/import'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expect(TicketsController.prototype[handler]).toBeDefined();
      expectHandlerRoute(TicketsController, handler, method, path);
    });

    it('exportTickets and importTickets use 200 OK per README', () => {
      for (const handler of ['exportTickets', 'importTickets'] as const) {
        const fn = TicketsController.prototype[handler];
        expect(fn).toBeDefined();
        const httpCode = Reflect.getMetadata(HTTP_CODE_METADATA, fn) as
          | number
          | undefined;
        expect(httpCode).toBe(200);
      }
    });
  });

  describe('controller delegation', () => {
    let controller: TicketsControllerSlice14;
    let ticketsService: TicketsServiceSlice14;

    beforeEach(async () => {
      ticketsService = {
        exportTicketsCsv: jest.fn().mockResolvedValue('id,title\n'),
        importTicketsFromCsv: jest.fn().mockResolvedValue(
          mockImportResult({ created: 1, failed: 0 }),
        ),
      } as unknown as TicketsServiceSlice14;

      const module: TestingModule = await Test.createTestingModule({
        controllers: [TicketsController],
        providers: [{ provide: TicketsService, useValue: ticketsService }],
      }).compile();

      controller = module.get(TicketsController) as TicketsControllerSlice14;
    });

    it('exportTickets delegates projectId to service', async () => {
      expect(controller.exportTickets).toBeDefined();
      await controller.exportTickets(5);

      expect(ticketsService.exportTicketsCsv).toHaveBeenCalledWith(5);
    });

    it('importTickets delegates file, projectId, and performer to service', async () => {
      expect(controller.importTickets).toBeDefined();
      const file = mockCsvFile('title,description,status,priority,type,assigneeId\n');

      const result = await controller.importTickets(file, 5, {
        user: mockUserResponse(),
      });

      expect(ticketsService.importTicketsFromCsv).toHaveBeenCalledWith(5, file, 1);
      expectTicketImportResultShape(result);
    });
  });

  describe('architecture constraints', () => {
    const ticketsServiceSource = readFileSync(
      join(__dirname, '../tickets/tickets.service.ts'),
      'utf8',
    );
    const ticketsControllerSource = readFileSync(
      join(__dirname, '../tickets/tickets.controller.ts'),
      'utf8',
    );

    it('does not use background jobs or queues for import/export', () => {
      expect(ticketsServiceSource).not.toMatch(
        /BullModule|@nestjs\/bull|Queue|schedule|cron|worker/i,
      );
      expect(ticketsControllerSource).not.toMatch(/BullModule|@nestjs\/bull|Queue/i);
    });

    it('does not persist imported CSV files to disk or external storage', () => {
      expect(ticketsServiceSource).not.toMatch(
        /writeFile|createWriteStream|multer\.diskStorage|cloudinary|aws-sdk|@aws-sdk/i,
      );
    });

    it('uses csv-parse and csv-stringify for deterministic CSV handling', () => {
      const ticketCsvSource = readFileSync(
        join(__dirname, '../tickets/ticket-csv.ts'),
        'utf8',
      );
      expect(ticketCsvSource).toMatch(/csv-parse/);
      expect(ticketCsvSource).toMatch(/csv-stringify/);
    });

    it('uses multipart upload with FileInterceptor on import', () => {
      const uploadConfigSource = readFileSync(
        join(__dirname, '../tickets/ticket-import-upload.config.ts'),
        'utf8',
      );
      expect(ticketsControllerSource).toMatch(/FileInterceptor\('file'\)/);
      expect(ticketsControllerSource).toMatch(/UploadedFile/);
      expect(ticketsControllerSource).toMatch(/importTickets/);
      expect(ticketsControllerSource).toMatch(/ParseFilePipe/);
      expect(ticketsControllerSource).toMatch(/ticketImportUploadValidators/);
      expect(uploadConfigSource).toMatch(/TicketCsvFileValidator/);
      expect(uploadConfigSource).toMatch(/MaxFileSizeValidator/);
    });

    it('returns raw CSV from export handler', () => {
      expect(ticketsControllerSource).toMatch(/exportTickets/);
      expect(ticketsControllerSource).toMatch(
        /text\/csv|StreamableFile|@Header\(\s*['"]Content-Type['"]\s*,\s*['"]text\/csv/i,
      );
    });

    it('registers export route before parameterized ticket routes', () => {
      const exportIndex = ticketsControllerSource.indexOf("@Get('export')");
      const ticketIdIndex = ticketsControllerSource.indexOf("@Get(':ticketId')");
      expect(exportIndex).toBeGreaterThan(-1);
      expect(ticketIdIndex).toBeGreaterThan(exportIndex);
    });
  });
});
