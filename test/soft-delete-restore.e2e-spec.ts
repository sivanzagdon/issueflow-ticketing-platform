import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditAction } from '../src/common/enums/audit-action.enum';
import { AuditEntityType } from '../src/common/enums/audit-entity-type.enum';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';
import { Project } from '../src/projects/entities/project.entity';
import { Ticket } from '../src/tickets/entities/ticket.entity';

/**
 * Slice 9 e2e: soft delete + restore (README).
 * Requires PostgreSQL — see run.md.
 */
describe('Soft delete and restore (e2e)', () => {
  let app: INestApplication;
  let ticketRepository: Repository<Ticket>;
  let projectRepository: Repository<Project>;

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

    ticketRepository = app.get(getRepositoryToken(Ticket));
    projectRepository = app.get(getRepositoryToken(Project));
  });

  afterEach(async () => {
    await app.close();
  });

  async function registerAndLogin(role = UserRole.DEVELOPER): Promise<{
    token: string;
    userId: number;
  }> {
    const id = uniqueSuffix();
    const password = 'password12';

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `sd-${id}`,
        email: `sd-${id}@example.com`,
        fullName: 'Soft Delete E2E',
        role,
        password,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `sd-${id}`, password })
      .expect(200);

    return {
      token: login.body.accessToken as string,
      userId: userRes.body.id as number,
    };
  }

  describe('Ticket soft delete and restore', () => {
    it('DELETE soft-deletes ticket, hides from standard GET, lists under /tickets/deleted', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set(auth)
        .send({ name: `SD Proj ${uniqueSuffix()}`, ownerId: userId })
        .expect(201);

      const projectId = projectRes.body.id as number;

      const ticketRes = await request(app.getHttpServer())
        .post('/tickets')
        .set(auth)
        .send({
          title: 'To delete',
          status: TicketStatus.TODO,
          priority: TicketPriority.MEDIUM,
          type: TicketType.BUG,
          projectId,
          assigneeId: userId,
        })
        .expect(201);

      const ticketId = ticketRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}`)
        .set(auth)
        .expect(200);

      const row = await ticketRepository.findOne({
        where: { id: ticketId },
        withDeleted: true,
      });
      expect(row).not.toBeNull();
      expect(row?.deletedAt).not.toBeNull();

      await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set(auth)
        .expect(404);

      await request(app.getHttpServer())
        .get('/tickets')
        .query({ projectId })
        .set(auth)
        .expect(200)
        .then((res) => {
          expect(res.body.find((t: { id: number }) => t.id === ticketId)).toBeUndefined();
        });

      const deletedList = await request(app.getHttpServer())
        .get('/tickets/deleted')
        .query({ projectId })
        .set(auth)
        .expect(200);

      expect(
        deletedList.body.some((t: { id: number }) => t.id === ticketId),
      ).toBe(true);
    });

    it('POST /tickets/:ticketId/restore restores visibility and writes RESTORE audit', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set(auth)
        .send({ name: `Restore ${uniqueSuffix()}`, ownerId: userId })
        .expect(201);

      const projectId = projectRes.body.id as number;

      const ticketRes = await request(app.getHttpServer())
        .post('/tickets')
        .set(auth)
        .send({
          title: 'To restore',
          status: TicketStatus.TODO,
          priority: TicketPriority.LOW,
          type: TicketType.FEATURE,
          projectId,
          assigneeId: userId,
        })
        .expect(201);

      const ticketId = ticketRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}`)
        .set(auth)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/restore`)
        .set(auth)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set(auth)
        .expect(200);

      const deletedList = await request(app.getHttpServer())
        .get('/tickets/deleted')
        .query({ projectId })
        .set(auth)
        .expect(200);

      expect(
        deletedList.body.some((t: { id: number }) => t.id === ticketId),
      ).toBe(false);

      const auditRes = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({
          entityType: AuditEntityType.TICKET,
          entityId: ticketId,
          action: AuditAction.RESTORE,
        })
        .set(auth)
        .expect(200);

      expect(auditRes.body.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 when restoring a ticket that is not deleted', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set(auth)
        .send({ name: `Active ${uniqueSuffix()}`, ownerId: userId })
        .expect(201);

      const ticketRes = await request(app.getHttpServer())
        .post('/tickets')
        .set(auth)
        .send({
          title: 'Still active',
          status: TicketStatus.TODO,
          priority: TicketPriority.HIGH,
          type: TicketType.BUG,
          projectId: projectRes.body.id,
          assigneeId: userId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketRes.body.id}/restore`)
        .set(auth)
        .expect(404);
    });
  });

  describe('Project soft delete and restore', () => {
    it('DELETE soft-deletes project and hides from standard GET /projects', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set(auth)
        .send({ name: `Del Proj ${uniqueSuffix()}`, ownerId: userId })
        .expect(201);

      const projectId = projectRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/projects/${projectId}`)
        .set(auth)
        .expect(200);

      const row = await projectRepository.findOne({
        where: { id: projectId },
        withDeleted: true,
      });
      expect(row).not.toBeNull();
      expect(row?.deletedAt).not.toBeNull();

      await request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set(auth)
        .expect(404);

      const allProjects = await request(app.getHttpServer())
        .get('/projects')
        .set(auth)
        .expect(200);

      expect(
        allProjects.body.some((p: { id: number }) => p.id === projectId),
      ).toBe(false);

      const deletedList = await request(app.getHttpServer())
        .get('/projects/deleted')
        .set(auth)
        .expect(200);

      expect(
        deletedList.body.some((p: { id: number }) => p.id === projectId),
      ).toBe(true);
    });

    it('POST /projects/:projectId/restore restores project visibility', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set(auth)
        .send({ name: `Restore Proj ${uniqueSuffix()}`, ownerId: userId })
        .expect(201);

      const projectId = projectRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/projects/${projectId}`)
        .set(auth)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/restore`)
        .set(auth)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set(auth)
        .expect(200);

      const deletedList = await request(app.getHttpServer())
        .get('/projects/deleted')
        .set(auth)
        .expect(200);

      expect(
        deletedList.body.some((p: { id: number }) => p.id === projectId),
      ).toBe(false);
    });
  });
});
