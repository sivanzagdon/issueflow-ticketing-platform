import { Repository } from 'typeorm';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { Ticket } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { ProjectWorkloadEntry } from './projects.mapper';

type WorkloadAggregateRow = {
  userId: string | number;
  username: string;
  createdAt: Date | string;
  openTicketCount: string | number;
};

export async function buildProjectWorkload(
  userRepository: Pick<Repository<User>, 'createQueryBuilder'>,
  projectId: number,
): Promise<ProjectWorkloadEntry[]> {
  const rows = await userRepository
    .createQueryBuilder('developer')
    .leftJoin(
      Ticket,
      'ticket',
      `ticket.assignee_id = developer.id
       AND ticket.project_id = :projectId
       AND ticket.status != :doneStatus
       AND ticket.deleted_at IS NULL`,
      { projectId, doneStatus: TicketStatus.DONE },
    )
    .select('developer.id', 'userId')
    .addSelect('developer.username', 'username')
    .addSelect('developer.createdAt', 'createdAt')
    .addSelect('COUNT(ticket.id)', 'openTicketCount')
    .where('developer.role = :role', { role: UserRole.DEVELOPER })
    .groupBy('developer.id')
    .addGroupBy('developer.username')
    .addGroupBy('developer.createdAt')
    .getRawMany<WorkloadAggregateRow>();

  if (rows.length === 0) {
    return [];
  }

  const developers = rows.map(
    (row) =>
      ({
        id: Number(row.userId),
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
      }) as User,
  );

  const entries: ProjectWorkloadEntry[] = rows.map((row) => ({
    userId: Number(row.userId),
    username: row.username,
    openTicketCount: Number(row.openTicketCount),
  }));

  return sortWorkloadEntries(entries, developers);
}

export function sortWorkloadEntries(
  entries: ProjectWorkloadEntry[],
  developers: User[],
): ProjectWorkloadEntry[] {
  const createdAtByUserId = new Map(
    developers.map((developer) => [developer.id, developer.createdAt.getTime()]),
  );

  return [...entries].sort((left, right) => {
    if (left.openTicketCount !== right.openTicketCount) {
      return left.openTicketCount - right.openTicketCount;
    }
    const leftCreatedAt = createdAtByUserId.get(left.userId) ?? 0;
    const rightCreatedAt = createdAtByUserId.get(right.userId) ?? 0;
    return leftCreatedAt - rightCreatedAt;
  });
}

export function pickLeastLoadedAssigneeId(
  workload: ProjectWorkloadEntry[],
): number | null {
  if (workload.length === 0) {
    return null;
  }

  const minCount = Math.min(...workload.map((entry) => entry.openTicketCount));
  const candidate = workload.find((entry) => entry.openTicketCount === minCount);
  return candidate?.userId ?? null;
}
