import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditAction } from '../src/common/enums/audit-action.enum';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';
import {
  AUDIT_ENTITY_TICKET_ATTACHMENT,
  expectTicketAttachmentListShape,
  expectTicketAttachmentResponseShape,
} from '../src/tickets/testing/attachment.fixtures';

/**
 * Slice 13 e2e — ticket attachment metadata lifecycle (README contract).
 * Requires PostgreSQL — see run.md.
 */
describe('Ticket attachments (e2e)', () => {
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
        username: `att-${id}`,
        email: `att-${id}@example.com`,
        fullName: 'Attachment E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `att-${id}`, password })
      .expect(200);

    return {
      token: login.body.accessToken as string,
      userId: userRes.body.id as number,
    };
  }

  async function createProjectAndTicket(
    token: string,
    userId: number,
    title = 'Attachment ticket',
  ): Promise<{ projectId: number; ticketId: number }> {
    const auth = { Authorization: `Bearer ${token}` };

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set(auth)
      .send({ name: `Att Proj ${uniqueSuffix()}`, ownerId: userId })
      .expect(201);

    const projectId = projectRes.body.id as number;

    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({
        title,
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.BUG,
        projectId,
        assigneeId: userId,
      })
      .expect(201);

    return { projectId, ticketId: ticketRes.body.id as number };
  }

  describe('attachment lifecycle', () => {
    it('creates metadata, lists attachments sorted by id, and deletes one', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId } = await createProjectAndTicket(token, userId);

      const createRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .send({ filename: 'first.png', contentType: 'image/png' })
        .expect(201);

      expectTicketAttachmentResponseShape(createRes.body);
      expect(createRes.body).toEqual(
        expect.objectContaining({
          ticketId,
          filename: 'first.png',
          contentType: 'image/png',
        }),
      );
      const firstId = createRes.body.id as number;

      const secondRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .send({ filename: 'first.png', contentType: 'image/png' })
        .expect(201);

      expect(secondRes.body.filename).toBe('first.png');
      const secondId = secondRes.body.id as number;
      expect(secondId).not.toBe(firstId);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .expect(200);

      expectTicketAttachmentListShape(listRes.body);
      expect(listRes.body).toEqual([
        expect.objectContaining({ id: firstId, ticketId, filename: 'first.png' }),
        expect.objectContaining({ id: secondId, ticketId, filename: 'first.png' }),
      ]);
      expect((listRes.body as { id: number }[]).map((a) => a.id)).toEqual(
        [firstId, secondId].sort((a, b) => a - b),
      );

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/attachments/${firstId}`)
        .set(auth)
        .expect(200);

      const afterDelete = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .expect(200);

      expect(afterDelete.body).toEqual([
        expect.objectContaining({ id: secondId, filename: 'first.png' }),
      ]);
    });
  });

  describe('validation and errors', () => {
    it('rejects attachment creation on soft-deleted ticket', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId } = await createProjectAndTicket(token, userId);

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}`)
        .set(auth)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .send({ filename: 'late.png', contentType: 'image/png' })
        .expect(400);
    });

    it('rejects unknown attachment id on delete', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId } = await createProjectAndTicket(token, userId);

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/attachments/999999`)
        .set(auth)
        .expect(404);
    });

    it('rejects extra multipart-style fields on create', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId } = await createProjectAndTicket(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .send({
          filename: 'x.png',
          contentType: 'image/png',
          file: 'should-not-be-here',
        })
        .expect(400);
    });
  });

  describe('cross-ticket isolation', () => {
    it('does not list attachments from another ticket', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId: ticketA } = await createProjectAndTicket(token, userId, 'A');
      const { ticketId: ticketB } = await createProjectAndTicket(token, userId, 'B');

      await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/attachments`)
        .set(auth)
        .send({ filename: 'only-a.png', contentType: 'image/png' })
        .expect(201);

      const listB = await request(app.getHttpServer())
        .get(`/tickets/${ticketB}/attachments`)
        .set(auth)
        .expect(200);

      expect(listB.body).toEqual([]);
    });

    it('cannot delete attachment using wrong ticket id in path', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId: ticketA } = await createProjectAndTicket(token, userId, 'A');
      const { ticketId: ticketB } = await createProjectAndTicket(token, userId, 'B');

      const created = await request(app.getHttpServer())
        .post(`/tickets/${ticketA}/attachments`)
        .set(auth)
        .send({ filename: 'a.png', contentType: 'image/png' })
        .expect(201);

      const attachmentId = created.body.id as number;

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketB}/attachments/${attachmentId}`)
        .set(auth)
        .expect(404);

      const listA = await request(app.getHttpServer())
        .get(`/tickets/${ticketA}/attachments`)
        .set(auth)
        .expect(200);

      expect(listA.body).toHaveLength(1);
    });
  });

  describe('audit consistency', () => {
    it('records CREATE and DELETE audits for attachment mutations', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId } = await createProjectAndTicket(token, userId);

      const created = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .send({ filename: 'audit-me.pdf', contentType: 'application/pdf' })
        .expect(201);

      const attachmentId = created.body.id as number;

      const createAudit = await request(app.getHttpServer())
        .get('/audit-logs')
        .set(auth)
        .query({
          entityType: AUDIT_ENTITY_TICKET_ATTACHMENT,
          entityId: attachmentId,
        })
        .expect(200);

      expect(createAudit.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: AuditAction.CREATE,
            entityType: AUDIT_ENTITY_TICKET_ATTACHMENT,
            entityId: attachmentId,
            details: expect.objectContaining({
              ticketId,
              attachmentId,
              filename: 'audit-me.pdf',
            }),
          }),
        ]),
      );

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/attachments/${attachmentId}`)
        .set(auth)
        .expect(200);

      const deleteAudit = await request(app.getHttpServer())
        .get('/audit-logs')
        .set(auth)
        .query({
          entityType: AUDIT_ENTITY_TICKET_ATTACHMENT,
          entityId: attachmentId,
          action: AuditAction.DELETE,
        })
        .expect(200);

      expect(deleteAudit.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: AuditAction.DELETE,
            details: expect.objectContaining({
              ticketId,
              attachmentId,
              filename: 'audit-me.pdf',
            }),
          }),
        ]),
      );
    });

    it('does not write attachment audit when create fails validation', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const { ticketId } = await createProjectAndTicket(token, userId);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set(auth)
        .send({ filename: '' })
        .expect(400);

      const auditRes = await request(app.getHttpServer())
        .get('/audit-logs')
        .set(auth)
        .query({ entityType: AUDIT_ENTITY_TICKET_ATTACHMENT })
        .expect(200);

      expect(auditRes.body).toEqual([]);
    });
  });
});
