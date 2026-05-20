import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';

describe('Tickets (e2e)', () => {
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
    projectId: number;
  }> {
    const id = uniqueSuffix();
    const password = 'password12';

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `tk-${id}`,
        email: `tk-${id}@example.com`,
        fullName: 'Ticket E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const ownerId = userRes.body.id as number;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `tk-${id}`, password })
      .expect(200);

    const token = login.body.accessToken as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Proj ${id}`,
        description: 'e2e',
        ownerId,
      })
      .expect(201);

    return { token, projectId: projectRes.body.id as number };
  }

  it('returns 401 when creating a ticket without JWT', async () => {
    const { projectId } = await registerLoginAndProject();

    await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'No auth',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId,
      })
      .expect(401);
  });

  it('creates a ticket when authenticated', async () => {
    const { token, projectId } = await registerLoginAndProject();

    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Auth ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.version).toBe(1);
  });

  it('returns 400 for invalid lifecycle transition', async () => {
    const { token, projectId } = await registerLoginAndProject();

    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Lifecycle',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId,
      })
      .expect(201);

    const ticketId = created.body.id as number;
    const version = created.body.version as number;

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version, status: TicketStatus.IN_REVIEW })
      .expect(400);
  });

  it('returns 409 when PATCH uses stale version', async () => {
    const { token, projectId } = await registerLoginAndProject();

    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Versioning',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId,
      })
      .expect(201);

    const ticketId = created.body.id as number;
    const v1 = created.body.version as number;

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: v1, title: 'First update' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: v1, title: 'Stale update' })
      .expect(409);
  });
});
