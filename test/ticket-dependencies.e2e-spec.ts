import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';
import { expectTicketBlockerListShape } from '../src/tickets/testing/dependency.fixtures';

/**
 * Slice 12 e2e — ticket dependency / blocker relationships (README contract).
 * Requires PostgreSQL — see run.md.
 */
describe('Ticket dependencies (e2e)', () => {
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

  async function registerAndLogin(): Promise<{ token: string; userId: number }> {
    const id = uniqueSuffix();
    const password = 'password12';

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `dep-${id}`,
        email: `dep-${id}@example.com`,
        fullName: 'Dependency E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `dep-${id}`, password })
      .expect(200);

    return {
      token: login.body.accessToken as string,
      userId: userRes.body.id as number,
    };
  }

  async function createProjectAndTickets(
    token: string,
    userId: number,
  ): Promise<{ projectId: number; ticketA: number; ticketB: number }> {
    const auth = { Authorization: `Bearer ${token}` };

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set(auth)
      .send({ name: `Dep Proj ${uniqueSuffix()}`, ownerId: userId })
      .expect(201);

    const projectId = projectRes.body.id as number;

    const ticketARes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({
        title: 'Blocked ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
        assigneeId: userId,
      })
      .expect(201);

    const ticketBRes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({
        title: 'Blocking ticket',
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId,
        assigneeId: userId,
      })
      .expect(201);

    return {
      projectId,
      ticketA: ticketARes.body.id as number,
      ticketB: ticketBRes.body.id as number,
    };
  }

  describe('dependency lifecycle', () => {
    it('creates dependency, lists blockers, and removes dependency', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketA, ticketB } = await createProjectAndTickets(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketB })
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .expect(200);

      expectTicketBlockerListShape(listRes.body);
      expect(listRes.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: ticketB,
            title: 'Blocking ticket',
            status: TicketStatus.IN_PROGRESS,
          }),
        ]),
      );

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketA}/dependencies/${ticketB}`)
        .set(auth)
        .expect(200);

      const afterRemove = await request(app.getHttpServer())
        .get(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .expect(200);

      expect(afterRemove.body).toEqual([]);
    });
  });

  describe('validation failures', () => {
    it('rejects duplicate dependency', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketA, ticketB } = await createProjectAndTickets(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketB })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketB })
        .expect(409);
    });

    it('rejects self-dependency', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketA } = await createProjectAndTickets(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketA })
        .expect(400);
    });
  });

  async function advanceTicketStatus(
    token: string,
    ticketId: number,
    from: TicketStatus,
    to: TicketStatus,
  ): Promise<number> {
    const auth = { Authorization: `Bearer ${token}` };
    const order = [
      TicketStatus.TODO,
      TicketStatus.IN_PROGRESS,
      TicketStatus.IN_REVIEW,
      TicketStatus.DONE,
    ];
    let version = 1;
    const ticketRes = await request(app.getHttpServer())
      .get(`/tickets/${ticketId}`)
      .set(auth)
      .expect(200);
    version = ticketRes.body.version as number;

    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(to);
    for (let i = fromIdx; i < toIdx; i += 1) {
      const next = order[i + 1];
      const updateRes = await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set(auth)
        .send({ version, status: next })
        .expect(200);
      version = updateRes.body.version as number;
    }
    return version;
  }

  describe('same-project constraint', () => {
    it('rejects dependency when tickets belong to different projects', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };

      const projectA = await request(app.getHttpServer())
        .post('/projects')
        .set(auth)
        .send({ name: `Proj A ${uniqueSuffix()}`, ownerId: userId })
        .expect(201);

      const projectB = await request(app.getHttpServer())
        .post('/projects')
        .set(auth)
        .send({ name: `Proj B ${uniqueSuffix()}`, ownerId: userId })
        .expect(201);

      const ticketARes = await request(app.getHttpServer())
        .post('/tickets')
        .set(auth)
        .send({
          title: 'Ticket in A',
          status: TicketStatus.TODO,
          priority: TicketPriority.MEDIUM,
          type: TicketType.BUG,
          projectId: projectA.body.id,
          assigneeId: userId,
        })
        .expect(201);

      const ticketBRes = await request(app.getHttpServer())
        .post('/tickets')
        .set(auth)
        .send({
          title: 'Ticket in B',
          status: TicketStatus.TODO,
          priority: TicketPriority.MEDIUM,
          type: TicketType.BUG,
          projectId: projectB.body.id,
          assigneeId: userId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketARes.body.id}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketBRes.body.id })
        .expect(400);
    });
  });

  describe('DONE transition with blockers', () => {
    it('rejects DONE while blockers are unresolved and allows DONE when blockers are DONE', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketA, ticketB } = await createProjectAndTickets(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketB })
        .expect(200);

      const versionAtReview = await advanceTicketStatus(
        token,
        ticketA,
        TicketStatus.TODO,
        TicketStatus.IN_REVIEW,
      );

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketA}`)
        .set(auth)
        .send({ version: versionAtReview, status: TicketStatus.DONE })
        .expect(400);

      await advanceTicketStatus(
        token,
        ticketB,
        TicketStatus.IN_PROGRESS,
        TicketStatus.DONE,
      );

      const ticketARes = await request(app.getHttpServer())
        .get(`/tickets/${ticketA}`)
        .set(auth)
        .expect(200);

      const doneRes = await request(app.getHttpServer())
        .patch(`/tickets/${ticketA}`)
        .set(auth)
        .send({
          version: ticketARes.body.version as number,
          status: TicketStatus.DONE,
        })
        .expect(200);

      expect(doneRes.body.status).toBe(TicketStatus.DONE);
    });

    it('allows DONE when blocker ticket is soft-deleted', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketA, ticketB } = await createProjectAndTickets(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketB })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketB}`)
        .set(auth)
        .expect(200);

      const versionAtReview = await advanceTicketStatus(
        token,
        ticketA,
        TicketStatus.TODO,
        TicketStatus.IN_REVIEW,
      );

      const doneRes = await request(app.getHttpServer())
        .patch(`/tickets/${ticketA}`)
        .set(auth)
        .send({ version: versionAtReview, status: TicketStatus.DONE })
        .expect(200);

      expect(doneRes.body.status).toBe(TicketStatus.DONE);
    });
  });

  describe('soft-deleted blocker', () => {
    it('does not return soft-deleted blocker in dependency list', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketA, ticketB } = await createProjectAndTickets(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .send({ blockedBy: ticketB })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketB}`)
        .set(auth)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketA}/dependencies`)
        .set(auth)
        .expect(200);

      expectTicketBlockerListShape(listRes.body);
      expect(
        (listRes.body as { id: number }[]).some((b) => b.id === ticketB),
      ).toBe(false);
    });
  });
});
