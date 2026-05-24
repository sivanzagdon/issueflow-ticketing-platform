import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import { buildProjectWorkload } from './project-workload';
import {
  ProjectResponse,
  ProjectWorkloadEntry,
  toProjectResponse,
} from './projects.mapper';

export type { ProjectResponse, ProjectWorkloadEntry };

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    createProjectDto: CreateProjectDto,
    performedBy?: number,
  ): Promise<ProjectResponse> {
    await this.usersService.findOne(createProjectDto.ownerId);

    return this.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(Project);
      const project = projectRepo.create({
        name: createProjectDto.name,
        description: createProjectDto.description,
        ownerId: createProjectDto.ownerId,
      });
      const saved = await projectRepo.save(project);

      await this.auditLogService.record(
        {
          action: AuditAction.CREATE,
          entityType: AuditEntityType.PROJECT,
          entityId: saved.id,
          performedBy: performedBy ?? createProjectDto.ownerId,
          actorType: AuditActor.USER,
          details: {
            name: saved.name,
            ownerId: saved.ownerId,
          },
        },
        manager,
      );

      return toProjectResponse(saved);
    });
  }

  async findAll(): Promise<ProjectResponse[]> {
    const projects = await this.projectRepository.find();
    return projects.map(toProjectResponse);
  }

  async findOne(id: number): Promise<ProjectResponse> {
    const project = await this.getProjectOrThrow(id);
    return toProjectResponse(project);
  }

  async getProjectWorkload(projectId: number): Promise<ProjectWorkloadEntry[]> {
    await this.getProjectOrThrow(projectId);
    return buildProjectWorkload(this.userRepository, projectId);
  }

  async update(
    id: number,
    updateProjectDto: UpdateProjectDto,
    performedBy?: number,
  ): Promise<ProjectResponse> {
    const project = await this.getProjectOrThrow(id);
    const before = { name: project.name, description: project.description };

    if (updateProjectDto.name !== undefined) {
      project.name = updateProjectDto.name;
    }
    if (updateProjectDto.description !== undefined) {
      project.description = updateProjectDto.description;
    }

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Project).save(project);
      const details: Record<string, unknown> = {};
      if (
        updateProjectDto.name !== undefined &&
        updateProjectDto.name !== before.name
      ) {
        details.name = { before: before.name, after: saved.name };
      }
      if (
        updateProjectDto.description !== undefined &&
        updateProjectDto.description !== before.description
      ) {
        details.description = {
          before: before.description,
          after: saved.description,
        };
      }

      await this.auditLogService.record(
        {
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.PROJECT,
          entityId: saved.id,
          performedBy: performedBy ?? saved.ownerId,
          actorType: AuditActor.USER,
          details: Object.keys(details).length > 0 ? details : null,
        },
        manager,
      );

      return toProjectResponse(saved);
    });
  }

  async findAllDeleted(): Promise<ProjectResponse[]> {
    const projects = await this.projectRepository.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
    });
    return projects.map(toProjectResponse);
  }

  async restore(id: number, performedBy?: number): Promise<ProjectResponse> {
    return this.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(Project);
      const project = await projectRepo.findOne({
        where: { id },
        withDeleted: true,
      });
      if (!project || project.deletedAt == null) {
        throw new NotFoundException(`Project ${id} not found`);
      }

      const deletedAt = project.deletedAt;
      await projectRepo.restore({ id });
      const restored = await projectRepo.findOne({ where: { id } });
      if (!restored) {
        throw new NotFoundException(`Project ${id} not found`);
      }

      await this.auditLogService.record(
        {
          action: AuditAction.RESTORE,
          entityType: AuditEntityType.PROJECT,
          entityId: id,
          performedBy: performedBy ?? project.ownerId,
          actorType: AuditActor.USER,
          details: {
            before: { deletedAt: deletedAt.toISOString() },
            after: { deletedAt: null },
          },
        },
        manager,
      );

      return toProjectResponse(restored);
    });
  }

  async remove(id: number, performedBy?: number): Promise<void> {
    const project = await this.getProjectOrThrow(id);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Project).softDelete({ id });
      await this.auditLogService.record(
        {
          action: AuditAction.DELETE,
          entityType: AuditEntityType.PROJECT,
          entityId: id,
          performedBy: performedBy ?? project.ownerId,
          actorType: AuditActor.USER,
        },
        manager,
      );
    });
  }

  private async getProjectOrThrow(id: number): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

}
