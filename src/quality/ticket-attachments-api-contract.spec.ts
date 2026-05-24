import { readFileSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { mockUserResponse } from '../users/testing/user.fixtures';
import {
  expectTicketAttachmentListShape,
  expectTicketAttachmentResponseShape,
  mockAttachmentList,
  mockAttachmentResponse,
  TicketAttachmentList,
  TicketAttachmentResponse,
  TicketsServiceSlice13,
} from '../tickets/testing/attachment.fixtures';
import { TicketsController } from '../tickets/tickets.controller';
import { TicketsService } from '../tickets/tickets.service';
import { expectHandlerRoute } from './testing/route-metadata.helpers';

type TicketsControllerSlice13 = TicketsController & {
  createAttachment(
    ticketId: number,
    body: { filename: string; contentType: string },
    req: { user: { id: number } },
  ): Promise<TicketAttachmentResponse>;
  getAttachments(ticketId: number): Promise<TicketAttachmentList>;
  removeAttachment(
    ticketId: number,
    attachmentId: number,
    req: { user: { id: number } },
  ): Promise<void>;
};

/**
 * Slice 13 — ticket attachments API contract (README metadata-only).
 */
describe('Ticket attachments API contract (Slice 13)', () => {
  describe('TicketsController routes', () => {
    it.each([
      ['createAttachment', RequestMethod.POST, 'tickets/:ticketId/attachments'],
      ['getAttachments', RequestMethod.GET, 'tickets/:ticketId/attachments'],
      [
        'removeAttachment',
        RequestMethod.DELETE,
        'tickets/:ticketId/attachments/:attachmentId',
      ],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(TicketsController, handler, method, path);
    });

    it('removeAttachment uses 200 OK per project convention', () => {
      const handler = (
        TicketsController.prototype as {
          removeAttachment?: () => void;
        }
      ).removeAttachment;
      const httpCode = Reflect.getMetadata(HTTP_CODE_METADATA, handler) as
        | number
        | undefined;
      expect(httpCode).toBe(200);
    });
  });

  describe('controller delegation', () => {
    let controller: TicketsControllerSlice13;
    let ticketsService: TicketsServiceSlice13;

    beforeEach(async () => {
      ticketsService = {
        createAttachment: jest.fn().mockResolvedValue(
          mockAttachmentResponse({ id: 1, ticketId: 12 }),
        ),
        getAttachments: jest.fn().mockResolvedValue(
          mockAttachmentList([
            mockAttachmentResponse({ id: 1, ticketId: 12 }),
          ]),
        ),
        removeAttachment: jest.fn().mockResolvedValue(undefined),
      } as unknown as TicketsServiceSlice13;

      const module: TestingModule = await Test.createTestingModule({
        controllers: [TicketsController],
        providers: [{ provide: TicketsService, useValue: ticketsService }],
      }).compile();

      controller = module.get(TicketsController) as TicketsControllerSlice13;
    });

    it('createAttachment delegates filename and contentType to service', async () => {
      const body = { filename: 'screenshot.png', contentType: 'image/png' };

      const result = await controller.createAttachment(12, body, {
        user: mockUserResponse(),
      });

      expect(ticketsService.createAttachment).toHaveBeenCalledWith(12, body, 1);
      expectTicketAttachmentResponseShape(result);
      expect(result).toEqual({
        id: 1,
        ticketId: 12,
        filename: 'screenshot.png',
        contentType: 'image/png',
      });
    });

    it('getAttachments returns README array without wrapper object', async () => {
      const result = await controller.getAttachments(12);

      expect(ticketsService.getAttachments).toHaveBeenCalledWith(12);
      expectTicketAttachmentListShape(result);
      expect(result).toEqual([
        {
          id: 1,
          ticketId: 12,
          filename: 'screenshot.png',
          contentType: 'image/png',
        },
      ]);
    });

    it('removeAttachment delegates ticketId and attachmentId', async () => {
      await controller.removeAttachment(12, 5, { user: mockUserResponse() });

      expect(ticketsService.removeAttachment).toHaveBeenCalledWith(12, 5, 1);
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

    it('does not integrate external file storage in tickets service', () => {
      expect(ticketsServiceSource).not.toMatch(
        /multer|cloudinary|aws-sdk|@aws-sdk|filesystem|readFileSync\(/i,
      );
    });

    it('does not expose multipart upload handling on attachments routes', () => {
      expect(ticketsControllerSource).not.toMatch(
        /FileInterceptor|UploadedFile|multipart\/form-data/i,
      );
    });

    it('keeps attachment handlers as thin delegation (no repository usage in controller)', () => {
      const controllerBody = ticketsControllerSource
        .split('export class TicketsController')[1]
        ?? '';
      expect(controllerBody).not.toMatch(/getRepository|DataSource|EntityManager/);
    });
  });
});
