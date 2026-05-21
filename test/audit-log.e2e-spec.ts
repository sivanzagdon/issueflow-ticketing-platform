import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditAction } from '../src/common/enums/audit-action.enum';
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
      actorType: 'USER',
    });
    expect(res.body[0]).toHaveProperty('createdAt');
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
    expect(ticket.body.stateHistory[0]).toHaveProperty('createdAt');
    expect(ticket.body.stateHistory[0]).toHaveProperty('details');
    expect(ticket.body.stateHistory[0]).not.toHaveProperty('entityType');
    const createdAtTimes = ticket.body.stateHistory.map(
      (e: { createdAt: string }) => new Date(e.createdAt).getTime(),
    );
    expect(createdAtTimes[0]).toBeLessThanOrEqual(createdAtTimes[1]);
  });
});
