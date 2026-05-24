import { Project } from './entities/project.entity';

export type ProjectResponse = Pick<
  Project,
  'id' | 'name' | 'description' | 'ownerId'
>;

/** README GET /projects/:projectId/workload entry. */
export type ProjectWorkloadEntry = {
  userId: number;
  username: string;
  openTicketCount: number;
};

export function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
  };
}
