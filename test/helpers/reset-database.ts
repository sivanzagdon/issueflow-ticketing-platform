import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Clears all tables so e2e tests that assume an empty DB can run deterministically. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const tableNames = dataSource.entityMetadatas
    .map((metadata) => {
      const table = metadata.tableName;
      const schema = metadata.schema;
      return schema ? `"${schema}"."${table}"` : `"${table}"`;
    })
    .join(', ');

  if (tableNames.length === 0) {
    return;
  }

  await dataSource.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE`);
}
