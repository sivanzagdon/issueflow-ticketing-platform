import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditAction } from '../src/common/enums/audit-action.enum';
import { AuditActor } from '../src/common/enums/audit-actor.enum';
import { AuditEntityType } from '../src/common/enums/audit-entity-type.enum';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';

describe('Audit Log (e2e)', () => {
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

  async function registerAndLogin(): Promise<{
    token: string;
    userId: number;
  }> {
    const id = uniqueSuffix();
    const password = 'password12';

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `audit-${id}`,
        email: `audit-${id}@example.com`,
        fullName: 'Audit E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const userId = userRes.body.id as number;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `audit-${id}`, password })
      .expect(200);

    return { token: login.body.accessToken as string, userId };
  }

  it('returns 401 for GET /audit-logs without JWT', async () => {
    await request(app.getHttpServer()).get('/audit-logs').expect(401);
  });

  it('does not expose POST /audit-logs', async () => {
    const { token } = await registerAndLogin();

    await request(app.getHttpServer())
      .post('/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: AuditAction.CREATE })
      .expect(404);
  });

  it('returns 200 for GET /audit-logs with JWT', async () => {
    const { token } = await registerAndLogin();

    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /audit-logs response matches README contract (actor, timestamp)', async () => {
    const { token, userId } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entityType: AuditEntityType.USER, entityId: userId })
      .set(auth)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const entry = res.body[0];
    expect(entry).toMatchObject({
      id: expect.any(Number),
      action: expect.any(String),
      entityType: AuditEntityType.USER,
      entityId: userId,
      actor: AuditActor.USER,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(entry).not.toHaveProperty('actorType');
    expect(entry).not.toHaveProperty('createdAt');
  });

  it('records audit log when user is created and supports entityType filter', async () => {
    const { token, userId } = await registerAndLogin();

    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entityType: AuditEntityType.USER, entityId: userId })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toMatchObject({
      entityType: AuditEntityType.USER,
      entityId: userId,
      action: AuditAction.CREATE,
      actor: AuditActor.USER,
    });
    expect(res.body[0]).toHaveProperty('timestamp');
    expect(res.body[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records audit logs through ticket lifecycle and supports combined filters', async () => {
    const { token, userId } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set(auth)
      .send({ name: `Audit Proj ${uniqueSuffix()}`, ownerId: userId })
      .expect(201);

    const projectId = projectRes.body.id as number;

    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({
        title: 'Audit ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId,
        assigneeId: userId,
      })
      .expect(201);

    const ticketId = ticketRes.body.id as number;
    const version = ticketRes.body.version as number;

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set(auth)
      .send({ version, status: TicketStatus.IN_PROGRESS })
      .expect(200);

    const logs = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({
        entityType: AuditEntityType.TICKET,
        entityId: ticketId,
        action: AuditAction.UPDATE,
        performedBy: userId,
      })
      .set(auth)
      .expect(200);

    expect(logs.body.length).toBeGreaterThanOrEqual(1);
    const statusLog = logs.body.find(
      (entry: { details?: { from?: string; to?: string } }) =>
        entry.details?.from === TicketStatus.TODO &&
        entry.details?.to === TicketStatus.IN_PROGRESS,
    );
    expect(statusLog).toBeDefined();
  });

  it('filters audit logs by actor=USER (README query param)', async () => {
    const { token, userId } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entityType: AuditEntityType.USER, entityId: userId, actor: AuditActor.USER })
      .set(auth)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((row: { actor: string }) => row.actor === AuditActor.USER)).toBe(true);
    expect(res.body.every((row: { timestamp: string }) => row.timestamp)).toBe(true);
  });

  it('filters audit logs by action and performedBy', async () => {
    const { token, userId } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({
        entityType: AuditEntityType.USER,
        entityId: userId,
        action: AuditAction.CREATE,
        performedBy: userId,
      })
      .set(auth)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toMatchObject({
      action: AuditAction.CREATE,
      performedBy: userId,
    });
  });

  it('append-only: ticket updates add new audit rows without mutating prior entries', async () => {
    const { token, userId } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set(auth)
      .send({ name: `Append ${uniqueSuffix()}`, ownerId: userId })
      .expect(201);

    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({
        title: 'Append-only ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.LOW,
        type: TicketType.FEATURE,
        projectId: projectRes.body.id,
        assigneeId: userId,
      })
      .expect(201);

    const ticketId = ticketRes.body.id as number;
    let version = ticketRes.body.version as number;

    const createLogs = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entityType: AuditEntityType.TICKET, entityId: ticketId })
      .set(auth)
      .expect(200);

    const createLogId = createLogs.body.find(
      (e: { action: string }) => e.action === AuditAction.CREATE,
    )?.id;
    expect(createLogId).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set(auth)
      .send({ version, status: TicketStatus.IN_PROGRESS })
      .expect(200);

    version += 1;
    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set(auth)
      .send({ version, status: TicketStatus.IN_REVIEW })
      .expect(200);

    const allLogs = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entityType: AuditEntityType.TICKET, entityId: ticketId })
      .set(auth)
      .expect(200);

    expect(allLogs.body.length).toBeGreaterThanOrEqual(3);
    const originalCreate = allLogs.body.find((e: { id: number }) => e.id === createLogId);
    expect(originalCreate).toBeDefined();
    expect(originalCreate.action).toBe(AuditAction.CREATE);
    expect(originalCreate.details).toEqual(
      expect.objectContaining({ title: 'Append-only ticket' }),
    );
  });

  it('GET /tickets/:id includes stateHistory derived from audit logs', async () => {
    const { token, userId } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set(auth)
      .send({ name: `Hist ${uniqueSuffix()}`, ownerId: userId })
      .expect(201);

    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({
        title: 'History ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId: projectRes.body.id,
        assigneeId: userId,
      })
      .expect(201);

    const ticketId = ticketRes.body.id as number;
    const version = ticketRes.body.version as number;

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set(auth)
      .send({ version, status: TicketStatus.IN_PROGRESS })
      .expect(200);

    const ticket = await request(app.getHttpServer())
      .get(`/tickets/${ticketId}`)
      .set(auth)
      .expect(200);

    expect(ticket.body).toHaveProperty('stateHistory');
    expect(Array.isArray(ticket.body.stateHistory)).toBe(true);
    expect(ticket.body.stateHistory.length).toBeGreaterThanOrEqual(2);
    expect(ticket.body.stateHistory[0]).toMatchObject({
      action: AuditAction.CREATE,
    });
    expect(ticket.body.stateHistory[0]).toHaveProperty('timestamp');
    expect(ticket.body.stateHistory[0]).toHaveProperty('actor');
    expect(ticket.body.stateHistory[0]).toHaveProperty('details');
    expect(ticket.body.stateHistory[0]).not.toHaveProperty('entityType');
    expect(ticket.body.stateHistory[0]).not.toHaveProperty('createdAt');
    const timestampTimes = ticket.body.stateHistory.map(
      (e: { timestamp: string }) => new Date(e.timestamp).getTime(),
    );
    expect(timestampTimes[0]).toBeLessThanOrEqual(timestampTimes[1]);
  });
});
