import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import {
  CommentResponse,
  toCommentResponse,
} from '../comments/comments.mapper';
import { CommentMention } from '../comments/entities/comment-mention.entity';
import { Comment } from '../comments/entities/comment.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { MentionsQueryDto } from './dto/mentions-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { toUserResponse, UserResponse } from './users.mapper';

export type PaginatedMentionsResponse = {
  data: CommentResponse[];
  total: number;
  page: number;
};

export type { UserResponse };

const DEFAULT_MENTIONS_PAGE = 1;
const DEFAULT_MENTIONS_PAGE_SIZE = 20;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CommentMention)
    private readonly commentMentionRepository: Repository<CommentMention>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const plainPassword =
      createUserDto.password ?? randomBytes(32).toString('hex');
    const passwordHash = await this.hashPassword(plainPassword);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const user = userRepo.create({
          username: createUserDto.username,
          email: createUserDto.email,
          fullName: createUserDto.fullName,
          role: createUserDto.role,
          passwordHash,
        });
        const saved = await userRepo.save(user);
        await this.auditLogService.record(
          {
            action: AuditAction.CREATE,
            entityType: AuditEntityType.USER,
            entityId: saved.id,
            performedBy: saved.id,
            actorType: AuditActor.USER,
            details: {
              username: saved.username,
              email: saved.email,
              role: saved.role,
            },
          },
          manager,
        );
        return toUserResponse(saved);
      });
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.userRepository.find();
    return users.map(toUserResponse);
  }

  async findOne(id: number): Promise<UserResponse> {
    const user = await this.getUserOrThrow(id);
    return toUserResponse(user);
  }

  async findMentionsForUser(
    userId: number,
    query: MentionsQueryDto,
  ): Promise<PaginatedMentionsResponse> {
    await this.getUserOrThrow(userId);

    const page = query.page ?? DEFAULT_MENTIONS_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_MENTIONS_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const qb = this.commentMentionRepository
      .createQueryBuilder('mention')
      .innerJoinAndSelect('mention.comment', 'comment')
      .where('mention.userId = :userId', { userId })
      .orderBy('comment.createdAt', 'DESC');

    const total = await qb.getCount();
    const mentions = await qb.skip(skip).take(pageSize).getMany();

    const data = await Promise.all(
      mentions.map((mention) =>
        this.buildCommentResponseWithMentions(mention.comment),
      ),
    );

    return { data, total, page };
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    performedBy?: number,
  ): Promise<UserResponse> {
    const user = await this.getUserOrThrow(id);
    const before = { fullName: user.fullName, role: user.role };

    if (updateUserDto.fullName !== undefined) {
      user.fullName = updateUserDto.fullName;
    }
    if (updateUserDto.role !== undefined) {
      user.role = updateUserDto.role;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const saved = await manager.getRepository(User).save(user);
        const details: Record<string, unknown> = {};
        if (
          updateUserDto.fullName !== undefined &&
          updateUserDto.fullName !== before.fullName
        ) {
          details.fullName = {
            before: before.fullName,
            after: saved.fullName,
          };
        }
        if (
          updateUserDto.role !== undefined &&
          updateUserDto.role !== before.role
        ) {
          details.role = { before: before.role, after: saved.role };
        }

        await this.auditLogService.record(
          {
            action: AuditAction.UPDATE,
            entityType: AuditEntityType.USER,
            entityId: saved.id,
            performedBy: performedBy ?? saved.id,
            actorType: AuditActor.USER,
            details: Object.keys(details).length > 0 ? details : null,
          },
          manager,
        );
        return toUserResponse(saved);
      });
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async remove(id: number, performedBy?: number): Promise<void> {
    await this.getUserOrThrow(id);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).delete({ id });
      await this.auditLogService.record(
        {
          action: AuditAction.DELETE,
          entityType: AuditEntityType.USER,
          entityId: id,
          performedBy: performedBy ?? id,
          actorType: AuditActor.USER,
        },
        manager,
      );
    });
  }

  private async buildCommentResponseWithMentions(
    comment: Comment,
  ): Promise<CommentResponse> {
    const mentions = await this.commentMentionRepository.find({
      where: { commentId: comment.id },
      relations: ['user'],
    });
    const mentionedUsers = mentions
      .map((m) => ({
        id: m.user.id,
        username: m.user.username,
        fullName: m.user.fullName,
      }))
      .sort((a, b) => a.id - b.id);

    return toCommentResponse(comment, mentionedUsers);
  }

  private async getUserOrThrow(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  private async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  private handlePersistenceError(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string })?.code === '23505'
    ) {
      throw new ConflictException('User with this username or email already exists');
    }
    throw error;
  }
}
