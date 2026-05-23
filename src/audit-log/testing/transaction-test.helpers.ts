import { EntityManager } from 'typeorm';
import { AuditLogService } from '../audit-log.service';
import { RecordAuditLogInput } from '../audit-log.types';

export type RecordWithManager = (
  input: RecordAuditLogInput,
  manager?: EntityManager,
) => ReturnType<AuditLogService['record']>;

export function bindRecordWithManager(
  service: AuditLogService,
): RecordWithManager {
  return service.record.bind(service) as RecordWithManager;
}

export interface MockTransactionalContext {
  dataSource: { transaction: jest.Mock };
  manager: EntityManager;
}

export function mockDataSourceWithRepositories(
  repositories: Map<unknown, object>,
): { transaction: jest.Mock } {
  return {
    transaction: jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) => {
      const manager = {
        getRepository: jest.fn((entity: unknown) => {
          const repo = repositories.get(entity);
          if (!repo) {
            throw new Error(`No mock repository for ${String(entity)}`);
          }
          return repo;
        }),
      } as unknown as EntityManager;
      return work(manager);
    }),
  };
}

export function createMockTransactionalContext(): MockTransactionalContext {
  const manager = {
    getRepository: jest.fn(),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn(
      async (work: (em: EntityManager) => Promise<unknown>) => work(manager),
    ),
  };

  return { dataSource, manager };
}

export function expectTransactionalAuditCall(
  auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>,
  manager: EntityManager,
  expected: Record<string, unknown>,
): void {
  expect(auditLogService.record).toHaveBeenCalledWith(
    expect.objectContaining(expected),
    manager,
  );
}
