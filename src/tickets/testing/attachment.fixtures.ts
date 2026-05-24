import { getRepositoryToken } from '@nestjs/typeorm';

/** Test-only stand-in until production TicketAttachment entity exists (Slice 13). */
export class TicketAttachmentEntityStub {
  id!: number;
  ticketId!: number;
  filename!: string;
  contentType!: string;
  createdAt!: Date;
  deletedAt!: Date | null;
}

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
  overrides: Partial<TicketAttachmentEntityStub> = {},
): TicketAttachmentEntityStub => ({
  id: 1,
  ticketId: 12,
  filename: 'screenshot.png',
  contentType: 'image/png',
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});

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
    provide: getRepositoryToken(TicketAttachmentEntityStub),
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

/** Slice 13 service surface — not implemented yet. */
export type TicketsServiceSlice13 = import('../tickets.service').TicketsService & {
  createAttachment(
    ticketId: number,
    dto: { filename: string; contentType: string },
    performedBy?: number,
  ): Promise<TicketAttachmentResponse>;
  getAttachments(ticketId: number): Promise<TicketAttachmentList>;
  removeAttachment(
    ticketId: number,
    attachmentId: number,
    performedBy?: number,
  ): Promise<void>;
};
