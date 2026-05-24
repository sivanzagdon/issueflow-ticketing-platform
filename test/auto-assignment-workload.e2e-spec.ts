import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditAction } from '../src/common/enums/audit-action.enum';
import { AuditActor } from '../src/common/enums/audit-actor.enum';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';
import { AUDIT_ACTION_AUTO_ASSIGN } from '../src/projects/testing/workload.fixtures';
import { expectProjectWorkloadListShape } from '../src/projects/testing/workload.fixtures';

/**
 * Slice 15 e2e — auto-assignment and project workload (README contract).
 * Requires PostgreSQL — see run.md.
 */
describe('Auto-assignment and workload (e2e)', () => {
  let app: INestApplication;

  const uniqueSuffix = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function registerUser(
    role: UserRole,
    label: string,
  ): Promise<{ token: string; userId: number; username: string }> {
    const id = uniqueSuffix();
    const password = 'password12';
    const username = `${label}-${id}`;

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({
        username,
        email: `${username}@example.com`,
        fullName: `${label} User`,
        role,
        password,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(200);

    return {
      token: login.body.accessToken as string,
      userId: userRes.body.id as number,
      username,
    };
  }

  async function createProject(token: string, ownerId: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/projects')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: `Workload Proj ${uniqueSuffix()}`, ownerId })
      .expect(201);
    return res.body.id as number;
  }

  async function createTicket(
    token: string,
    body: Record<string, unknown>,
  ): Promise<{ id: number; assigneeId: number | null }> {
    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set({ Authorization: `Bearer ${token}` })
      .send(body)
      .expect(201);
    return {
      id: res.body.id as number,
      assigneeId: res.body.assigneeId as number | null,
    };
  }

  describe('Scenario 1 — least-loaded developer auto-assigned', () => {
    it('assigns ticket to developer with lowest open workload', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm');
      const busy = await registerUser(UserRole.DEVELOPER, 'busy');
      const free = await registerUser(UserRole.DEVELOPER, 'free');
      const projectId = await createProject(admin.token, admin.userId);

      const ticketBody = {
        title: 'Workload seed',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
      };

      await createTicket(admin.token, { ...ticketBody, assigneeId: busy.userId });
      await createTicket(admin.token, { ...ticketBody, assigneeId: busy.userId });

      const created = await createTicket(admin.token, {
        title: 'Auto assigned ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
      });

      expect(created.assigneeId).toBe(free.userId);
    });
  });

  describe('Scenario 2 — explicit assignee bypasses auto-assignment', () => {
    it('keeps explicit assigneeId when provided', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm2');
      const dev = await registerUser(UserRole.DEVELOPER, 'dev2');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await createTicket(admin.token, {
        title: 'Explicit assignee',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
        assigneeId: dev.userId,
      });

      expect(created.assigneeId).toBe(dev.userId);
    });
  });

  describe('Scenario 3 — DONE tickets ignored in workload', () => {
    it('does not count DONE tickets toward workload', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm3');
      const dev = await registerUser(UserRole.DEVELOPER, 'dev3');
      const projectId = await createProject(admin.token, admin.userId);

      const doneTicket = await createTicket(admin.token, {
        title: 'Done ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
        assigneeId: dev.userId,
      });
      await request(app.getHttpServer())
        .patch(`/tickets/${doneTicket.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({ version: 1, status: TicketStatus.IN_PROGRESS })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/tickets/${doneTicket.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({ version: 2, status: TicketStatus.IN_REVIEW })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/tickets/${doneTicket.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({ version: 3, status: TicketStatus.DONE })
        .expect(200);

      const workload = await request(app.getHttpServer())
        .get(`/projects/${projectId}/workload`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      expectProjectWorkloadListShape(workload.body);
      const devEntry = (workload.body as { userId: number; openTicketCount: number }[]).find(
        (e) => e.userId === dev.userId,
      );
      expect(devEntry?.openTicketCount).toBe(0);
    });
  });

  describe('Scenario 4 — deleted tickets ignored in workload', () => {
    it('does not count soft-deleted tickets toward workload', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm4');
      const dev = await registerUser(UserRole.DEVELOPER, 'dev4');
      const projectId = await createProject(admin.token, admin.userId);

      const deleted = await createTicket(admin.token, {
        title: 'To delete',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
        assigneeId: dev.userId,
      });
      await request(app.getHttpServer())
        .delete(`/tickets/${deleted.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      const workload = await request(app.getHttpServer())
        .get(`/projects/${projectId}/workload`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      const devEntry = (workload.body as { userId: number; openTicketCount: number }[]).find(
        (e) => e.userId === dev.userId,
      );
      expect(devEntry?.openTicketCount).toBe(0);
    });
  });

  describe('Scenario 5 — workload endpoint', () => {
    it('excludes ADMIN users from workload response', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm5a');
      await registerUser(UserRole.DEVELOPER, 'dev5a');
      const projectId = await createProject(admin.token, admin.userId);

      const workload = await request(app.getHttpServer())
        .get(`/projects/${projectId}/workload`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      const userIds = (workload.body as { userId: number }[]).map((e) => e.userId);
      expect(userIds).not.toContain(admin.userId);
    });

    it('returns 404 when project does not exist', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm5b');

      await request(app.getHttpServer())
        .get('/projects/999999999/workload')
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(404);
    });
  });

  describe('Scenario 5b — workload sorted counts', () => {
    it('returns developers sorted by ascending openTicketCount', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm5');
      const low = await registerUser(UserRole.DEVELOPER, 'low');
      const high = await registerUser(UserRole.DEVELOPER, 'high');
      const projectId = await createProject(admin.token, admin.userId);

      const body = {
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
      };
      await createTicket(admin.token, {
        ...body,
        title: 'High 1',
        assigneeId: high.userId,
      });
      await createTicket(admin.token, {
        ...body,
        title: 'High 2',
        assigneeId: high.userId,
      });
      await createTicket(admin.token, {
        ...body,
        title: 'Low 1',
        assigneeId: low.userId,
      });

      const workload = await request(app.getHttpServer())
        .get(`/projects/${projectId}/workload`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      expectProjectWorkloadListShape(workload.body);
      const counts = (workload.body as { openTicketCount: number }[]).map(
        (e) => e.openTicketCount,
      );
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
      expect(counts[0]).toBeLessThanOrEqual(counts[counts.length - 1]);
    });
  });

  describe('Scenario 6 — no developers leaves ticket unassigned', () => {
    it('creates ticket with null assignee when only admins exist', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm6');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await createTicket(admin.token, {
        title: 'Unassigned',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
      });

      expect(created.assigneeId).toBeNull();
    });
  });

  describe('AUTO_ASSIGN audit on system assignment', () => {
    it('records SYSTEM AUTO_ASSIGN audit when ticket is auto-assigned', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'adm7');
      await registerUser(UserRole.DEVELOPER, 'solo');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await createTicket(admin.token, {
        title: 'Audit auto',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
      });

      const audit = await request(app.getHttpServer())
        .get('/audit-logs')
        .set({ Authorization: `Bearer ${admin.token}` })
        .query({ entityType: 'TICKET', entityId: created.id })
        .expect(200);

      const autoAssign = (audit.body as { action: string; actor: string }[]).find(
        (e) => e.action === AUDIT_ACTION_AUTO_ASSIGN,
      );
      expect(autoAssign).toBeDefined();
      expect(autoAssign?.actor).toBe(AuditActor.SYSTEM);
      expect(
        (audit.body as { action: string }[]).filter(
          (e) => e.action === AuditAction.CREATE,
        ),
      ).toHaveLength(1);
    });
  });
});
