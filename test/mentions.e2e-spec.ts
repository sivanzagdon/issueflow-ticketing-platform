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
import { expectPaginatedMentionsShape } from '../src/comments/testing/mention.fixtures';

/**
 * Slice 11 e2e — @username mentions in comments.
 * Requires PostgreSQL — see run.md.
 */
describe('Mentions (e2e)', () => {
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
    username: string,
    fullName: string,
  ): Promise<{ id: number; username: string; password: string }> {
    const password = 'password12';
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({
        username,
        email: `${username}@example.com`,
        fullName,
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    return { id: res.body.id as number, username, password };
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function setupTicket(
    token: string,
    ownerId: number,
  ): Promise<{ ticketId: number; projectId: number }> {
    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Mentions Proj ${uniqueSuffix()}`,
        description: 'e2e',
        ownerId,
      })
      .expect(201);

    const projectId = projectRes.body.id as number;

    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Mentions ticket',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
        assigneeId: ownerId,
      })
      .expect(201);

    return { ticketId: ticketRes.body.id as number, projectId };
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  describe('create comment with mention', () => {
    it('returns mentionedUsers and lists comment via mentions API', async () => {
      const suffix = uniqueSuffix();
      const author = await registerUser(`author-${suffix}`, 'Author User');
      const mentioned = await registerUser(`john-${suffix}`, 'John Smith');
      const token = await login(author.username, author.password);
      const { ticketId } = await setupTicket(token, author.id);

      const createRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set(auth(token))
        .send({
          authorId: author.id,
          content: `Hello @${mentioned.username}!`,
        })
        .expect(201);

      expect(createRes.body.mentionedUsers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: mentioned.id,
            username: mentioned.username,
            fullName: 'John Smith',
          }),
        ]),
      );
      expect(createRes.body.version).toBeDefined();

      const mentionsRes = await request(app.getHttpServer())
        .get(`/users/${mentioned.id}/mentions`)
        .query({ page: 1, pageSize: 10 })
        .set(auth(token))
        .expect(200);

      expectPaginatedMentionsShape(mentionsRes.body);
      expect(mentionsRes.body.data.some((c: { id: number }) => c.id === createRes.body.id)).toBe(
        true,
      );
    });
  });

  describe('update comment mentions', () => {
    it('re-evaluates mentions when content changes', async () => {
      const suffix = uniqueSuffix();
      const author = await registerUser(`upd-author-${suffix}`, 'Author');
      const john = await registerUser(`upd-john-${suffix}`, 'John');
      const jane = await registerUser(`upd-jane-${suffix}`, 'Jane Doe');
      const token = await login(author.username, author.password);
      const { ticketId } = await setupTicket(token, author.id);

      const createRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set(auth(token))
        .send({ authorId: author.id, content: `Hi @${john.username}` })
        .expect(201);

      const commentId = createRes.body.id as number;
      const version = createRes.body.version as number;

      const updateRes = await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set(auth(token))
        .send({
          version,
          content: `Now ping @${jane.username} only`,
        })
        .expect(200);

      expect(updateRes.body.mentionedUsers).toEqual([
        expect.objectContaining({
          id: jane.id,
          username: jane.username,
          fullName: 'Jane Doe',
        }),
      ]);

      const johnMentions = await request(app.getHttpServer())
        .get(`/users/${john.id}/mentions`)
        .query({ page: 1, pageSize: 10 })
        .set(auth(token))
        .expect(200);

      expect(
        johnMentions.body.data.some((c: { id: number }) => c.id === commentId),
      ).toBe(false);

      const janeMentions = await request(app.getHttpServer())
        .get(`/users/${jane.id}/mentions`)
        .query({ page: 1, pageSize: 10 })
        .set(auth(token))
        .expect(200);

      expect(
        janeMentions.body.data.some((c: { id: number }) => c.id === commentId),
      ).toBe(true);
    });
  });

  describe('stale optimistic-lock update', () => {
    it('returns 409 and leaves mentions and audit unchanged', async () => {
      const suffix = uniqueSuffix();
      const author = await registerUser(`stale-author-${suffix}`, 'Author');
      const mentioned = await registerUser(`stale-john-${suffix}`, 'John');
      const token = await login(author.username, author.password);
      const { ticketId } = await setupTicket(token, author.id);

      const createRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set(auth(token))
        .send({ authorId: author.id, content: `Hi @${mentioned.username}` })
        .expect(201);

      const commentId = createRes.body.id as number;
      const initialVersion = createRes.body.version as number;

      const firstUpdate = await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set(auth(token))
        .send({
          version: initialVersion,
          content: `Updated @${mentioned.username}`,
        })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set(auth(token))
        .send({
          version: initialVersion,
          content: 'Stale overwrite @ghost',
        })
        .expect(409);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .set(auth(token))
        .expect(200);

      const persisted = listRes.body.find(
        (c: { id: number }) => c.id === commentId,
      );
      expect(persisted.content).toBe(`Updated @${mentioned.username}`);
      expect(persisted.mentionedUsers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: mentioned.id }),
        ]),
      );

      const auditRes = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({
          entityType: AuditEntityType.COMMENT,
          entityId: commentId,
          action: AuditAction.UPDATE,
        })
        .set(auth(token))
        .expect(200);

      expect(auditRes.body).toHaveLength(1);
      expect(firstUpdate.body.version).toBeGreaterThan(initialVersion);
    });
  });

  describe('mentions pagination', () => {
    it('returns data, total, and page with correct ordering', async () => {
      const suffix = uniqueSuffix();
      const author = await registerUser(`page-author-${suffix}`, 'Author');
      const mentioned = await registerUser(`page-john-${suffix}`, 'John');
      const token = await login(author.username, author.password);
      const { ticketId } = await setupTicket(token, author.id);

      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post(`/tickets/${ticketId}/comments`)
          .set(auth(token))
          .send({
            authorId: author.id,
            content: `Mention ${i} @${mentioned.username}`,
          })
          .expect(201);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const page1 = await request(app.getHttpServer())
        .get(`/users/${mentioned.id}/mentions`)
        .query({ page: 1, pageSize: 2 })
        .set(auth(token))
        .expect(200);

      expectPaginatedMentionsShape(page1.body);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.total).toBeGreaterThanOrEqual(3);
      expect(page1.body.page).toBe(1);

      if (page1.body.data.length >= 2) {
        const newest = new Date(page1.body.data[0].createdAt).getTime();
        const older = new Date(page1.body.data[1].createdAt).getTime();
        expect(newest).toBeGreaterThanOrEqual(older);
      }

      const page2 = await request(app.getHttpServer())
        .get(`/users/${mentioned.id}/mentions`)
        .query({ page: 2, pageSize: 2 })
        .set(auth(token))
        .expect(200);

      expect(page2.body.page).toBe(2);
      expect(page2.body.total).toBe(page1.body.total);
    });

    it('returns 404 for missing user on mentions endpoint', async () => {
      const suffix = uniqueSuffix();
      const author = await registerUser(`404-author-${suffix}`, 'Author');
      const token = await login(author.username, author.password);

      await request(app.getHttpServer())
        .get('/users/999999/mentions')
        .query({ page: 1, pageSize: 10 })
        .set(auth(token))
        .expect(404);
    });
  });
});
