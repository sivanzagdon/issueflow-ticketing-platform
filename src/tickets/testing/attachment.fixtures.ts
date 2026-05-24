import { getRepositoryToken } from '@nestjs/typeorm';
import { TicketAttachment } from '../entities/ticket-attachment.entity';

/** Alias used by Slice 13 specs — production entity is TicketAttachment. */
export { TicketAttachment as TicketAttachmentEntityStub };

/** README attachment response shape. */
export type TicketAttachmentResponse = {
  id: number;
  ticketId: number;
  filename: string;
  contentType: string;
};

export type TicketAttachmentList = TicketAttachmentResponse[];

export const AUDIT_ENTITY_TICKET_ATTACHMENT = 'TICKET_ATTACHMENT';

export const mockAttachmentEntity = (
  overrides: Partial<TicketAttachment> = {},
): TicketAttachment =>
  ({
    id: 1,
    ticketId: 12,
    filename: 'screenshot.png',
    contentType: 'image/png',
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as TicketAttachment;

export const mockAttachmentResponse = (
  overrides: Partial<TicketAttachmentResponse> = {},
): TicketAttachmentResponse => ({
  id: 1,
  ticketId: 12,
  filename: 'screenshot.png',
  contentType: 'image/png',
  ...overrides,
});

export const mockAttachmentList = (
  items: TicketAttachmentResponse[] = [mockAttachmentResponse()],
): TicketAttachmentList => items;

export const mockUploadFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'screenshot.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 128,
    buffer: Buffer.from('test-file'),
    ...overrides,
  }) as Express.Multer.File;

export function expectTicketAttachmentResponseShape(
  body: TicketAttachmentResponse,
): void {
  expect(body).toEqual(
    expect.objectContaining({
      id: expect.any(Number),
      ticketId: expect.any(Number),
      filename: expect.any(String),
      contentType: expect.any(String),
    }),
  );
  expect(body).not.toHaveProperty('deletedAt');
  expect(body).not.toHaveProperty('createdAt');
  expect(body).not.toHaveProperty('file');
  expect(body).not.toHaveProperty('url');
  expect(body).not.toHaveProperty('storageKey');
}

export function expectTicketAttachmentListShape(body: unknown): void {
  expect(Array.isArray(body)).toBe(true);
  expect(body).not.toHaveProperty('ticketId');
  expect(body).not.toHaveProperty('attachments');
  for (const item of body as TicketAttachmentResponse[]) {
    expectTicketAttachmentResponseShape(item);
  }
}

export function ticketAttachmentRepositoryProvider(): {
  provide: ReturnType<typeof getRepositoryToken>;
  useValue: ReturnType<typeof createMockAttachmentRepository>;
} {
  return {
    provide: getRepositoryToken(TicketAttachment),
    useValue: createMockAttachmentRepository(),
  };
}

export function createMockAttachmentRepository(): {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  softDelete: jest.Mock;
  delete: jest.Mock;
} {
  return {
    create: jest.fn((dto: Record<string, unknown>) => ({
      id: 1,
      createdAt: new Date(),
      deletedAt: null,
      ...dto,
    })),
    save: jest.fn().mockImplementation(async (entity) => entity),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    softDelete: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
  };
}

/** Slice 13 service surface. */
export type TicketsServiceSlice13 = import('../tickets.service').TicketsService & {
  createAttachment(
    ticketId: number,
    file: Express.Multer.File,
    performedBy?: number,
  ): Promise<TicketAttachmentResponse>;
  getAttachments(ticketId: number): Promise<TicketAttachmentList>;
  removeAttachment(
    ticketId: number,
    attachmentId: number,
    performedBy?: number,
  ): Promise<void>;
};
