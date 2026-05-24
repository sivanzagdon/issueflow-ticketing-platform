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

/**
 * Slice 10 e2e — optimistic locking / concurrent edit prevention.
 * Requires PostgreSQL — see run.md.
 */
describe('Optimistic locking (e2e)', () => {
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

  async function registerLoginAndProject(): Promise<{
    token: string;
    userId: number;
    projectId: number;
  }> {
    const id = uniqueSuffix();
    const password = 'password12';

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `ol-${id}`,
        email: `ol-${id}@example.com`,
        fullName: 'Optimistic Lock E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const userId = userRes.body.id as number;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `ol-${id}`, password })
      .expect(200);

    const token = login.body.accessToken as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `OL Proj ${id}`, description: 'e2e', ownerId: userId })
      .expect(201);

    return { token, userId, projectId: projectRes.body.id as number };
  }

  function authHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  describe('ticket stale update', () => {
    it('returns 409 on stale version and preserves first successful update', async () => {
      const { token, userId, projectId } = await registerLoginAndProject();

      const createRes = await request(app.getHttpServer())
        .post('/tickets')
        .set(authHeader(token))
        .send({
          title: 'Concurrency ticket',
          status: TicketStatus.TODO,
          priority: TicketPriority.MEDIUM,
          type: TicketType.BUG,
          projectId,
          assigneeId: userId,
        })
        .expect(201);

      const ticketId = createRes.body.id as number;
      const initialVersion = createRes.body.version as number;

      const firstUpdate = await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set(authHeader(token))
        .send({ version: initialVersion, title: 'First writer wins' })
        .expect(200);

      expect(firstUpdate.body.title).toBe('First writer wins');
      expect(firstUpdate.body.version).toBeGreaterThan(initialVersion);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set(authHeader(token))
        .send({ version: initialVersion, title: 'Stale overwrite' })
        .expect(409);

      const getRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set(authHeader(token))
        .expect(200);

      expect(getRes.body.title).toBe('First writer wins');
      expect(getRes.body.version).toBe(firstUpdate.body.version);

      const auditRes = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({
          entityType: AuditEntityType.TICKET,
          entityId: ticketId,
          action: AuditAction.UPDATE,
        })
        .set(authHeader(token))
        .expect(200);

      expect(auditRes.body).toHaveLength(1);
      expect(auditRes.body[0].details).toEqual(
        expect.objectContaining({
          title: expect.objectContaining({ after: 'First writer wins' }),
        }),
      );
    });
  });

  describe('comment stale update', () => {
    it('returns 409 on stale version and preserves first successful update', async () => {
      const { token, userId, projectId } = await registerLoginAndProject();

      const ticketRes = await request(app.getHttpServer())
        .post('/tickets')
        .set(authHeader(token))
        .send({
          title: 'Comment concurrency ticket',
          status: TicketStatus.TODO,
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId,
          assigneeId: userId,
        })
        .expect(201);

      const ticketId = ticketRes.body.id as number;

      const commentRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set(authHeader(token))
        .send({ authorId: userId, content: 'Original comment' })
        .expect(201);

      const commentId = commentRes.body.id as number;
      const initialVersion = commentRes.body.version as number;

      const firstUpdate = await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set(authHeader(token))
        .send({ version: initialVersion, content: 'First edit wins' })
        .expect(200);

      expect(firstUpdate.body.content).toBe('First edit wins');
      expect(firstUpdate.body.version).toBeGreaterThan(initialVersion);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set(authHeader(token))
        .send({ version: initialVersion, content: 'Stale overwrite' })
        .expect(409);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .set(authHeader(token))
        .expect(200);

      const persisted = listRes.body.find(
        (c: { id: number }) => c.id === commentId,
      );
      expect(persisted.content).toBe('First edit wins');
      expect(persisted.version).toBe(firstUpdate.body.version);

      const auditRes = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({
          entityType: AuditEntityType.COMMENT,
          entityId: commentId,
          action: AuditAction.UPDATE,
        })
        .set(authHeader(token))
        .expect(200);

      expect(auditRes.body).toHaveLength(1);
      expect(auditRes.body[0].details).toEqual(
        expect.objectContaining({
          content: expect.objectContaining({ after: 'First edit wins' }),
        }),
      );
    });
  });
});
