import { TicketStatus } from '../../common/enums/ticket-status.enum';

/** Test-only stand-in for the dependency association table (Slice 12). */
export class TicketDependencyEntityStub {
  id!: number;
  ticketId!: number;
  blockerTicketId!: number;
  createdAt!: Date;
}

/** README GET /tickets/:ticketId/dependencies response item. */
export type TicketBlockerSummary = {
  id: number;
  title: string;
  status: TicketStatus;
};

/** README list response: a direct array of blockers. */
export type TicketBlockerList = TicketBlockerSummary[];

export const AUDIT_ENTITY_TICKET_DEPENDENCY = 'TICKET_DEPENDENCY';

export const mockDependencyEntity = (
  overrides: Partial<TicketDependencyEntityStub> = {},
): TicketDependencyEntityStub => ({
  id: 1,
  ticketId: 10,
  blockerTicketId: 42,
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
  ...overrides,
});

export const mockBlockerSummary = (
  overrides: Partial<TicketBlockerSummary> = {},
): TicketBlockerSummary => ({
  id: 42,
  title: 'Blocking ticket',
  status: TicketStatus.IN_PROGRESS,
  ...overrides,
});

export const mockBlockerList = (
  blockers: TicketBlockerSummary[] = [mockBlockerSummary()],
): TicketBlockerList => blockers;

export function expectTicketBlockerListShape(body: unknown): void {
  expect(Array.isArray(body)).toBe(true);
  for (const blocker of body as TicketBlockerSummary[]) {
    expect(blocker).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        title: expect.any(String),
        status: expect.any(String),
      }),
    );
    expect(blocker).not.toHaveProperty('ticketId');
    expect(blocker).not.toHaveProperty('blockers');
    expect(blocker).not.toHaveProperty('description');
    expect(blocker).not.toHaveProperty('assigneeId');
    expect(blocker).not.toHaveProperty('passwordHash');
  }
}

export function createMockDependencyRepository(): {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
} {
  return {
    create: jest.fn((dto: Record<string, unknown>) => ({
      id: 1,
      createdAt: new Date(),
      ...dto,
    })),
    save: jest.fn().mockImplementation(async (entity) => entity),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
    createQueryBuilder: jest.fn(),
  };
}

/** Slice 12 service surface — not implemented yet. */
export type TicketsServiceSlice12 = import('../tickets.service').TicketsService & {
  addDependency(
    ticketId: number,
    blockedBy: number,
    performedBy?: number,
  ): Promise<void>;
  getDependencies(ticketId: number): Promise<TicketBlockerList>;
  removeDependency(
    ticketId: number,
    blockerId: number,
    performedBy?: number,
  ): Promise<void>;
};
