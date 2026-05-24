import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';

/** Minimal User repo for ProjectsService tests that do not exercise workload. */
export const projectsServiceWorkloadRepositoryProviders = () => [
  {
    provide: getRepositoryToken(User),
    useValue: {
      createQueryBuilder: jest.fn(),
    },
  },
];
