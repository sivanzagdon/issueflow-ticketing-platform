import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditEntityType } from '../src/common/enums/audit-entity-type.enum';
import { TicketPriority } from '../src/common/enums/ticket-priority.enum';
import { TicketStatus } from '../src/common/enums/ticket-status.enum';
import { TicketType } from '../src/common/enums/ticket-type.enum';
import { UserRole } from '../src/common/enums/user-role.enum';
import {
  buildImportCsv,
  buildImportCsvRow,
  expectTicketImportResultShape,
  TICKET_EXPORT_CSV_HEADER,
} from '../src/tickets/testing/ticket-csv.fixtures';

/**
 * Slice 14 e2e — ticket CSV import/export (README contract).
 * Requires PostgreSQL — see run.md.
 */
describe('Ticket import/export (e2e)', () => {
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
        username: `csv-${id}`,
        email: `csv-${id}@example.com`,
        fullName: 'CSV E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `csv-${id}`, password })
      .expect(200);

    return {
      token: login.body.accessToken as string,
      userId: userRes.body.id as number,
    };
  }

  async function createProject(
    token: string,
    ownerId: number,
  ): Promise<number> {
    const auth = { Authorization: `Bearer ${token}` };
    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set(auth)
      .send({ name: `CSV Proj ${uniqueSuffix()}`, ownerId })
      .expect(201);
    return projectRes.body.id as number;
  }

  async function createTicket(
    token: string,
    projectId: number,
    body: Record<string, unknown>,
  ): Promise<number> {
    const auth = { Authorization: `Bearer ${token}` };
    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set(auth)
      .send({ projectId, ...body })
      .expect(200);
    return ticketRes.body.id as number;
  }

  async function auditCountForTicketCreates(token: string): Promise<number> {
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .set(auth)
      .query({ entityType: AuditEntityType.TICKET, action: 'CREATE' })
      .expect(200);
    return (res.body as unknown[]).length;
  }

  describe('Scenario 1 — export escaped CSV', () => {
    it('exports project tickets with README header and escaped commas/quotes', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const projectId = await createProject(token, userId);

      const ticketId = await createTicket(token, projectId, {
        title: 'Comma, title',
        description: 'Quoted "description"',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        assigneeId: userId,
      });

      const res = await request(app.getHttpServer())
        .get('/tickets/export')
        .set(auth)
        .query({ projectId })
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/i);
      const csv = res.text as string;
      expect(csv.split('\n')[0]).toBe(TICKET_EXPORT_CSV_HEADER);
      expect(csv).toContain('"Comma, title"');
      expect(csv).toContain('"Quoted ""description"""');
      expect(csv).toContain(String(ticketId));
    });
  });

  describe('Scenario 2 — import valid CSV', () => {
    it('creates tickets and returns README summary', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const projectId = await createProject(token, userId);

      const csv = buildImportCsv([
        buildImportCsvRow({
          title: `Import ok ${uniqueSuffix()}`,
          status: TicketStatus.TODO,
          priority: TicketPriority.MEDIUM,
          type: TicketType.FEATURE,
          assigneeId: userId,
        }),
      ]);

      const beforeAudit = await auditCountForTicketCreates(token);

      const res = await request(app.getHttpServer())
        .post('/tickets/import')
        .set(auth)
        .field('projectId', String(projectId))
        .attach('file', Buffer.from(csv), {
          filename: 'import.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      expectTicketImportResultShape(res.body);
      expect(res.body.created).toBe(1);
      expect(res.body.failed).toBe(0);

      const list = await request(app.getHttpServer())
        .get('/tickets')
        .set(auth)
        .query({ projectId })
        .expect(200);

      expect(
        (list.body as { title: string }[]).some((t) =>
          t.title.startsWith('Import ok'),
        ),
      ).toBe(true);

      const afterAudit = await auditCountForTicketCreates(token);
      expect(afterAudit).toBeGreaterThan(beforeAudit);
    });
  });

  describe('Scenario 3 — mixed valid/invalid import', () => {
    it('reports partial success and persists only valid rows', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const projectId = await createProject(token, userId);

      const validTitle = `Partial ${uniqueSuffix()}`;
      const csv = buildImportCsv([
        buildImportCsvRow({
          title: validTitle,
          status: TicketStatus.TODO,
          priority: TicketPriority.MEDIUM,
          type: TicketType.FEATURE,
        }),
        buildImportCsvRow({
          title: '',
          status: TicketStatus.TODO,
          priority: TicketPriority.MEDIUM,
          type: TicketType.FEATURE,
        }),
      ]);

      const res = await request(app.getHttpServer())
        .post('/tickets/import')
        .set(auth)
        .field('projectId', String(projectId))
        .attach('file', Buffer.from(csv), {
          filename: 'mixed.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      expect(res.body.created).toBe(1);
      expect(res.body.failed).toBe(1);
      expect(res.body.errors).toHaveLength(1);

      const list = await request(app.getHttpServer())
        .get('/tickets')
        .set(auth)
        .query({ projectId })
        .expect(200);

      expect((list.body as { title: string }[]).map((t) => t.title)).toContain(
        validTitle,
      );
    });
  });

  describe('Scenario 4 — export excludes soft-deleted tickets', () => {
    it('does not include deleted tickets in CSV export', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const projectId = await createProject(token, userId);

      const activeId = await createTicket(token, projectId, {
        title: `Active ${uniqueSuffix()}`,
        status: TicketStatus.TODO,
        priority: TicketPriority.LOW,
        type: TicketType.FEATURE,
      });
      const deletedId = await createTicket(token, projectId, {
        title: `Deleted ${uniqueSuffix()}`,
        status: TicketStatus.TODO,
        priority: TicketPriority.LOW,
        type: TicketType.FEATURE,
      });
      await request(app.getHttpServer())
        .delete(`/tickets/${deletedId}`)
        .set(auth)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/tickets/export')
        .set(auth)
        .query({ projectId })
        .expect(200);

      const csv = res.text as string;
      expect(csv).toContain(String(activeId));
      expect(csv).not.toContain(String(deletedId));
    });
  });

  describe('Scenario 5 — validation failures', () => {
    it('returns 400 when export projectId is missing', async () => {
      const { token } = await registerAndLogin();
      await request(app.getHttpServer())
        .get('/tickets/export')
        .set({ Authorization: `Bearer ${token}` })
        .expect(400);
    });

    it('returns 404 when export project does not exist', async () => {
      const { token } = await registerAndLogin();
      await request(app.getHttpServer())
        .get('/tickets/export')
        .set({ Authorization: `Bearer ${token}` })
        .query({ projectId: 999999999 })
        .expect(404);
    });

    it('returns 400 when import file is missing', async () => {
      const { token, userId } = await registerAndLogin();
      const projectId = await createProject(token, userId);

      await request(app.getHttpServer())
        .post('/tickets/import')
        .set({ Authorization: `Bearer ${token}` })
        .field('projectId', String(projectId))
        .expect(400);
    });

    it('returns 400 when import projectId is missing', async () => {
      const { token } = await registerAndLogin();
      const csv = buildImportCsv([]);

      await request(app.getHttpServer())
        .post('/tickets/import')
        .set({ Authorization: `Bearer ${token}` })
        .attach('file', Buffer.from(csv), {
          filename: 'no-project.csv',
          contentType: 'text/csv',
        })
        .expect(400);
    });

    it('returns failed rows for malformed CSV content', async () => {
      const { token, userId } = await registerAndLogin();
      const projectId = await createProject(token, userId);
      const malformed = `${TICKET_EXPORT_CSV_HEADER}\n"broken row\n`;

      const res = await request(app.getHttpServer())
        .post('/tickets/import')
        .set({ Authorization: `Bearer ${token}` })
        .field('projectId', String(projectId))
        .attach('file', Buffer.from(malformed), {
          filename: 'bad.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      expect(res.body.failed).toBeGreaterThan(0);
      expect(res.body.created).toBe(0);
    });
  });

  describe('export does not create audit log entries', () => {
    it('leaves ticket CREATE audit count unchanged after export', async () => {
      const { token, userId } = await registerAndLogin();
      const auth = { Authorization: `Bearer ${token}` };
      const projectId = await createProject(token, userId);
      await createTicket(token, projectId, {
        title: `Audit export ${uniqueSuffix()}`,
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      });

      const before = await auditCountForTicketCreates(token);

      await request(app.getHttpServer())
        .get('/tickets/export')
        .set(auth)
        .query({ projectId })
        .expect(200);

      const after = await auditCountForTicketCreates(token);
      expect(after).toBe(before);
    });
  });

  describe('empty project export', () => {
    it('returns header-only CSV', async () => {
      const { token, userId } = await registerAndLogin();
      const projectId = await createProject(token, userId);

      const res = await request(app.getHttpServer())
        .get('/tickets/export')
        .set({ Authorization: `Bearer ${token}` })
        .query({ projectId })
        .expect(200);

      expect(res.text.trim()).toBe(TICKET_EXPORT_CSV_HEADER);
    });
  });
});
