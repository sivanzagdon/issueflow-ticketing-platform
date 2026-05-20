import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';

describe('Final submission flow (e2e)', () => {
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

  it('runs end-to-end happy path: user → project → ticket → comments → lifecycle → cleanup', async () => {
    const id = uniqueSuffix();
    const password = 'password12';

    await request(app.getHttpServer()).get('/projects').expect(401);

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `flow-${id}`,
        email: `flow-${id}@example.com`,
        fullName: 'Flow User',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const ownerId = userRes.body.id as number;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `flow-${id}`, password })
      .expect(200);

    const token = login.body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set(auth)
      .send({ name: `Flow Proj ${id}`, description: 'e2e', ownerId })
      .expect(201);

    const projectId = projectRes.body.id as number;

    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({
        title: 'Flow ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
        projectId,
        assigneeId: ownerId,
      })
      .expect(201);

    const ticketId = ticketRes.body.id as number;
    let version = ticketRes.body.version as number;

    const commentRes = await request(app.getHttpServer())
      .post(`/tickets/${ticketId}/comments`)
      .set(auth)
      .send({ authorId: ownerId, content: 'Flow comment' })
      .expect(201);

    const commentId = commentRes.body.id as number;
    expect(commentRes.body.ticketId).toBe(ticketId);
    expect(commentRes.body.content).toBe('Flow comment');

    const listRes = await request(app.getHttpServer())
      .get(`/tickets/${ticketId}/comments`)
      .set(auth)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((c: { id: number }) => c.id === commentId)).toBe(
      true,
    );

    const forwardRes = await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set(auth)
      .send({ version, status: TicketStatus.IN_PROGRESS })
      .expect(200);

    version = forwardRes.body.version as number;
    expect(forwardRes.body.status).toBe(TicketStatus.IN_PROGRESS);

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set(auth)
      .send({ version, status: TicketStatus.DONE })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/tickets/${ticketId}/comments/${commentId}`)
      .set(auth)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/tickets/${ticketId}`)
      .set(auth)
      .expect(200);
  });
});
