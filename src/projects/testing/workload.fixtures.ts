import { UserRole } from '../../common/enums/user-role.enum';
import { AuditActor } from '../../common/enums/audit-actor.enum';
import { User } from '../../users/entities/user.entity';
import { mockUserEntity } from '../../users/testing/user.fixtures';

/** README workload entry (GET /projects/:projectId/workload). */
export type ProjectWorkloadEntry = {
  userId: number;
  username: string;
  openTicketCount: number;
};

/** Slice 15 — AUTO_ASSIGN audit action (enum added during implementation). */
export const AUDIT_ACTION_AUTO_ASSIGN = 'AUTO_ASSIGN' as const;

export const mockWorkloadEntry = (
  overrides: Partial<ProjectWorkloadEntry> = {},
): ProjectWorkloadEntry => ({
  userId: 1,
  username: 'jdoe',
  openTicketCount: 0,
  ...overrides,
});

export const mockWorkloadList = (
  entries: ProjectWorkloadEntry[],
): ProjectWorkloadEntry[] => entries;

export function expectProjectWorkloadListShape(
  body: ProjectWorkloadEntry[],
): void {
  expect(Array.isArray(body)).toBe(true);
  for (const entry of body) {
    expect(entry).toEqual(
      expect.objectContaining({
        userId: expect.any(Number),
        username: expect.any(String),
        openTicketCount: expect.any(Number),
      }),
    );
    expect(Object.keys(entry).sort()).toEqual([
      'openTicketCount',
      'userId',
      'username',
    ]);
  }
  expect(body).not.toHaveProperty('data');
  expect(body).not.toHaveProperty('total');
}

export const mockDeveloperUsers = (): User[] => [
  mockUserEntity({
    id: 10,
    username: 'older-dev',
    role: UserRole.DEVELOPER,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  }),
  mockUserEntity({
    id: 11,
    username: 'newer-dev',
    role: UserRole.DEVELOPER,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
  }),
];

export const mockAdminUser = (): User =>
  mockUserEntity({
    id: 99,
    username: 'admin-user',
    role: UserRole.ADMIN,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
  });

export const expectAutoAssignAuditPayload = (
  payload: Record<string, unknown>,
): void => {
  expect(payload).toEqual(
    expect.objectContaining({
      action: AUDIT_ACTION_AUTO_ASSIGN,
      actorType: AuditActor.SYSTEM,
      performedBy: null,
      details: expect.objectContaining({
        assignedTo: expect.any(Number),
      }),
    }),
  );
};

/** Slice 15 service surface — not implemented yet. */
export type ProjectsServiceSlice15 = import('../projects.service').ProjectsService & {
  getProjectWorkload(projectId: number): Promise<ProjectWorkloadEntry[]>;
};
