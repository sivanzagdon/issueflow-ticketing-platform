import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditActor } from '../src/common/enums/audit-actor.enum';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';
import { TicketsService } from '../src/tickets/tickets.service';
import {
  AUDIT_ACTION_AUTO_ESCALATE,
  SLICE16_FIXED_NOW,
  SLICE16_PAST_DUE,
  TicketsServiceSlice16,
} from '../src/tickets/testing/escalation.fixtures';
import { resetDatabase } from './helpers/reset-database';

/**
 * Slice 16 e2e — ticket auto-escalation (README contract).
 * Requires PostgreSQL — see run.md.
 */
describe('Auto-escalation (e2e)', () => {
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
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  async function registerUser(
    role: UserRole,
    label: string,
  ): Promise<{ token: string; userId: number }> {
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
    };
  }

  async function createProject(token: string, ownerId: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/projects')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: `Escalation Proj ${uniqueSuffix()}`, ownerId })
      .expect(201);
    return res.body.id as number;
  }

  async function runEscalation(now = SLICE16_FIXED_NOW): Promise<void> {
    const ticketsService = app.get(TicketsService) as TicketsServiceSlice16;
    await ticketsService.runAutoEscalation(now);
  }

  describe('Scenario 1 — overdue LOW becomes MEDIUM', () => {
    it('escalates ticket with past dueDate from LOW to MEDIUM', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'esc-adm1');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await request(app.getHttpServer())
        .post('/tickets')
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({
          title: 'Overdue low',
          status: TicketStatus.TODO,
          priority: TicketPriority.LOW,
          type: TicketType.BUG,
          projectId,
          dueDate: SLICE16_PAST_DUE.toISOString(),
        })
        .expect(201);

      await runEscalation();

      const ticket = await request(app.getHttpServer())
        .get(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      expect(ticket.body.priority).toBe(TicketPriority.MEDIUM);
      expect(ticket.body.status).toBe(TicketStatus.TODO);
    });
  });

  describe('Scenario 2 — overdue HIGH becomes CRITICAL', () => {
    it('escalates HIGH overdue ticket to CRITICAL', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'esc-adm2');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await request(app.getHttpServer())
        .post('/tickets')
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({
          title: 'Overdue high',
          status: TicketStatus.TODO,
          priority: TicketPriority.HIGH,
          type: TicketType.BUG,
          projectId,
          dueDate: SLICE16_PAST_DUE.toISOString(),
        })
        .expect(201);

      await runEscalation();

      const ticket = await request(app.getHttpServer())
        .get(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      expect(ticket.body.priority).toBe(TicketPriority.CRITICAL);
    });
  });

  describe('Scenario 3 — overdue CRITICAL marked overdue', () => {
    it('sets isOverdue true and keeps CRITICAL priority', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'esc-adm3');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await request(app.getHttpServer())
        .post('/tickets')
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({
          title: 'Overdue critical',
          status: TicketStatus.TODO,
          priority: TicketPriority.CRITICAL,
          type: TicketType.BUG,
          projectId,
          dueDate: SLICE16_PAST_DUE.toISOString(),
        })
        .expect(201);

      await runEscalation();

      const ticket = await request(app.getHttpServer())
        .get(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      expect(ticket.body.priority).toBe(TicketPriority.CRITICAL);
      expect(ticket.body.isOverdue).toBe(true);
    });
  });

  describe('Scenario 4 — DONE overdue ticket ignored', () => {
    it('does not escalate DONE ticket even when past dueDate', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'esc-adm4');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await request(app.getHttpServer())
        .post('/tickets')
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({
          title: 'Done overdue',
          status: TicketStatus.TODO,
          priority: TicketPriority.LOW,
          type: TicketType.BUG,
          projectId,
          dueDate: SLICE16_PAST_DUE.toISOString(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({ version: 1, status: TicketStatus.IN_PROGRESS })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({ version: 2, status: TicketStatus.IN_REVIEW })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({ version: 3, status: TicketStatus.DONE })
        .expect(200);

      await runEscalation();

      const ticket = await request(app.getHttpServer())
        .get(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);

      expect(ticket.body.priority).toBe(TicketPriority.LOW);
      expect(ticket.body.status).toBe(TicketStatus.DONE);
      expect(ticket.body.isOverdue).toBe(false);
    });
  });

  describe('Scenario 5 — manual priority reset and re-escalation', () => {
    it('clears isOverdue on manual priority change and re-escalates from new priority', async () => {
      const admin = await registerUser(UserRole.ADMIN, 'esc-adm5');
      const projectId = await createProject(admin.token, admin.userId);

      const created = await request(app.getHttpServer())
        .post('/tickets')
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({
          title: 'Manual reset',
          status: TicketStatus.TODO,
          priority: TicketPriority.LOW,
          type: TicketType.BUG,
          projectId,
          dueDate: SLICE16_PAST_DUE.toISOString(),
        })
        .expect(201);

      await runEscalation();

      const afterFirst = await request(app.getHttpServer())
        .get(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);
      expect(afterFirst.body.priority).toBe(TicketPriority.MEDIUM);

      await request(app.getHttpServer())
        .patch(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .send({ version: afterFirst.body.version, priority: TicketPriority.LOW })
        .expect(200);

      const afterManual = await request(app.getHttpServer())
        .get(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);
      expect(afterManual.body.priority).toBe(TicketPriority.LOW);
      expect(afterManual.body.isOverdue).toBe(false);

      await runEscalation();

      const afterSecond = await request(app.getHttpServer())
        .get(`/tickets/${created.body.id}`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(200);
      expect(afterSecond.body.priority).toBe(TicketPriority.MEDIUM);

      const audit = await request(app.getHttpServer())
        .get('/audit-logs')
        .set({ Authorization: `Bearer ${admin.token}` })
        .query({ entityType: 'TICKET', entityId: created.body.id })
        .expect(200);

      const autoEscalate = (audit.body as { action: string; actor: string }[]).filter(
        (entry) => entry.action === AUDIT_ACTION_AUTO_ESCALATE,
      );
      expect(autoEscalate.length).toBeGreaterThanOrEqual(2);
      expect(autoEscalate.every((entry) => entry.actor === AuditActor.SYSTEM)).toBe(
        true,
      );
    });
  });
});
