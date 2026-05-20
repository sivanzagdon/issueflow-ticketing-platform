import { Project } from '../entities/project.entity';
import { ProjectResponse } from '../projects.service';

export const mockProjectEntity = (overrides: Partial<Project> = {}): Project => ({
  id: 1,
  name: 'Sample Project',
  description: 'A sample project',
  ownerId: 1,
  owner: {} as Project['owner'],
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

export const mockProjectResponse = (
  overrides: Partial<ProjectResponse> = {},
): ProjectResponse => ({
  id: 1,
  name: 'Sample Project',
  description: 'A sample project',
  ownerId: 1,
  ...overrides,
});
