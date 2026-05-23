import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { AuditLog } from '../src/audit-log/entities/audit-log.entity';
import { UserRole } from '../src/common/enums/user-role.enum';
import { User } from '../src/users/entities/user.entity';

/**
 * Integration proof: business mutation and audit insert share one DB transaction.
 * Requires PostgreSQL (see run.md).
 */
describe('Audit log transactional rollback (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;

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

    userRepository = app.get(getRepositoryToken(User));
    auditLogRepository = app.get(getRepositoryToken(AuditLog));
  });

  afterEach(async () => {
    await app.close();
  });

  it('rolls back user row when audit record fails inside the same transaction', async () => {
    const suffix = uniqueSuffix();
    const username = `rollback-${suffix}`;
    const email = `rollback-${suffix}@example.com`;

    const usersBefore = await userRepository.count();
    const auditsBefore = await auditLogRepository.count();

    const auditLogService = app.get(AuditLogService);
    jest
      .spyOn(auditLogService, 'record')
      .mockRejectedValueOnce(new Error('simulated audit insert failure'));

    await request(app.getHttpServer())
      .post('/users')
      .send({
        username,
        email,
        fullName: 'Rollback Test',
        role: UserRole.DEVELOPER,
        password: 'password12',
      })
      .expect(500);

    const usersAfter = await userRepository.count();
    const auditsAfter = await auditLogRepository.count();

    expect(usersAfter).toBe(usersBefore);
    expect(auditsAfter).toBe(auditsBefore);

    const orphan = await userRepository.findOne({ where: { username } });
    expect(orphan).toBeNull();
  });

  it('does not leave audit rows when user insert fails (unique violation)', async () => {
    const suffix = uniqueSuffix();
    const password = 'password12';
    const body = {
      username: `dup-${suffix}`,
      email: `dup-${suffix}@example.com`,
      fullName: 'Dup User',
      role: UserRole.DEVELOPER,
      password,
    };

    await request(app.getHttpServer()).post('/users').send(body).expect(201);

    const auditsBeforeSecondAttempt = await auditLogRepository.count({
      where: { entityType: 'USER' as never },
    });

    await request(app.getHttpServer()).post('/users').send(body).expect(409);

    const auditsAfterSecondAttempt = await auditLogRepository.count({
      where: { entityType: 'USER' as never },
    });

    expect(auditsAfterSecondAttempt).toBe(auditsBeforeSecondAttempt);
  });
});
