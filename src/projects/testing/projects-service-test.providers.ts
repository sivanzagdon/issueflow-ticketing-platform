import { getRepositoryToken } from '@nestjs/typeorm';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { User } from '../../users/entities/user.entity';

/** Minimal User/Ticket repos for ProjectsService tests that do not exercise workload. */
export const projectsServiceWorkloadRepositoryProviders = () => [
  {
    provide: getRepositoryToken(User),
    useValue: { find: jest.fn().mockResolvedValue([]) },
  },
  {
    provide: getRepositoryToken(Ticket),
    useValue: { count: jest.fn().mockResolvedValue(0) },
  },
];
