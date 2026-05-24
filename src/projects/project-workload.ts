import { IsNull, Not, Repository } from 'typeorm';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { Ticket } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { ProjectWorkloadEntry } from './projects.mapper';

export async function countOpenProjectTickets(
  ticketRepository: Pick<Repository<Ticket>, 'count'>,
  projectId: number,
  assigneeId: number,
): Promise<number> {
  return ticketRepository.count({
    where: {
      projectId,
      assigneeId,
      status: Not(TicketStatus.DONE),
      deletedAt: IsNull(),
    },
  });
}

export async function buildProjectWorkload(
  userRepository: Pick<Repository<User>, 'find'>,
  ticketRepository: Pick<Repository<Ticket>, 'count'>,
  projectId: number,
): Promise<ProjectWorkloadEntry[]> {
  const developers = await userRepository.find({
    where: { role: UserRole.DEVELOPER },
    order: { createdAt: 'ASC' },
  });

  const entries: ProjectWorkloadEntry[] = [];
  for (const developer of developers) {
    const openTicketCount = await countOpenProjectTickets(
      ticketRepository,
      projectId,
      developer.id,
    );
    entries.push({
      userId: developer.id,
      username: developer.username,
      openTicketCount,
    });
  }

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
