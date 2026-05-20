import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums/user-role.enum';

describe('Auth (e2e)', () => {
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

  it('login succeeds with valid credentials', async () => {
    const id = uniqueSuffix();
    const password = 'password12';

    await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `auth-e2e-${id}`,
        email: `auth-e2e-${id}@example.com`,
        fullName: 'Auth E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `auth-e2e-${id}`, password })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.tokenType).toBe('Bearer');
  });

  it('login returns 401 for invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nouser', password: 'badpassword1' })
      .expect(401);
  });

  it('returns 401 for protected route without JWT', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('logout invalidates token for subsequent requests', async () => {
    const id = uniqueSuffix();
    const password = 'password12';

    await request(app.getHttpServer())
      .post('/users')
      .send({
        username: `lo-${id}`,
        email: `lo-${id}@example.com`,
        fullName: 'Logout E2E',
        role: UserRole.DEVELOPER,
        password,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `lo-${id}`, password })
      .expect(200);

    const token = login.body.accessToken as string;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
