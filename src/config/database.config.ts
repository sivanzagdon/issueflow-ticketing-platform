import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'issueflow',
  password: process.env.DB_PASSWORD ?? 'issueflow',
  database: process.env.DB_NAME ?? 'issueflow',
  autoLoadEntities: true,
  synchronize: true,
  logging: ['error'],
});
