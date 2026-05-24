import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm'; // In used in enrichCommentsWithMentions
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketsService } from '../tickets/tickets.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  CommentResponse,
  MentionedUserSummary,
  toCommentResponse,
  toMentionedUser,
} from './comments.mapper';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentMention } from './entities/comment-mention.entity';
import { Comment } from './entities/comment.entity';
import { findUsersByMentionUsernames } from './mention-user-lookup';
import { parseMentionUsernames } from './mention-parser';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(CommentMention)
    private readonly commentMentionRepository: Repository<CommentMention>,
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    ticketId: number,
    dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    return this.dataSource.transaction(async (manager) => {
      const ticket = await manager.getRepository(Ticket).findOne({
        where: { id: ticketId },
      });
      if (!ticket) {
        throw new NotFoundException(`Ticket ${ticketId} not found`);
      }

      const author = await manager.getRepository(User).findOne({
        where: { id: dto.authorId },
      });
      if (!author) {
        throw new NotFoundException(`User ${dto.authorId} not found`);
      }

      const commentRepo = manager.getRepository(Comment);
      const comment = commentRepo.create({
        ticketId,
        authorId: dto.authorId,
        content: dto.content,
      });

      const saved = await commentRepo.save(comment);
      const mentionedUsers = await this.syncMentions(
        manager,
        saved.id,
        dto.content,
      );

      await this.auditLogService.record(
        {
          action: AuditAction.CREATE,
          entityType: AuditEntityType.COMMENT,
          entityId: saved.id,
          performedBy: dto.authorId,
          actorType: AuditActor.USER,
          details: {
            ticketId,
            authorId: dto.authorId,
            content: dto.content,
          },
        },
        manager,
      );

      return toCommentResponse(saved, mentionedUsers);
    });
  }

  async findByTicket(ticketId: number): Promise<CommentResponse[]> {
    await this.ticketsService.findOne(ticketId);

    const comments = await this.commentRepository.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
    return this.enrichCommentsWithMentions(comments);
  }

  async update(
    commentId: number,
    dto: UpdateCommentDto,
    performedBy?: number,
  ): Promise<CommentResponse> {
    return this.dataSource.transaction(async (manager) => {
      const commentRepo = manager.getRepository(Comment);
      const comment = await commentRepo.findOne({
        where: { id: commentId },
      });
      if (!comment) {
        throw new NotFoundException(`Comment ${commentId} not found`);
      }

      if (dto.version !== comment.version) {
        throw new ConflictException('Comment version conflict');
      }

      const beforeContent = comment.content;
      comment.content = dto.content;
      const saved = await commentRepo.save(comment);
      const mentionedUsers = await this.syncMentions(
        manager,
        saved.id,
        dto.content,
      );

      await this.auditLogService.record(
        {
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.COMMENT,
          entityId: saved.id,
          performedBy: performedBy ?? comment.authorId,
          actorType: AuditActor.USER,
          details: {
            content: { before: beforeContent, after: saved.content },
          },
        },
        manager,
      );

      return toCommentResponse(saved, mentionedUsers);
    });
  }

  async remove(commentId: number, performedBy?: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const commentRepo = manager.getRepository(Comment);
      const comment = await commentRepo.findOne({
        where: { id: commentId },
      });
      if (!comment) {
        throw new NotFoundException(`Comment ${commentId} not found`);
      }

      await commentRepo.remove(comment);
      await this.auditLogService.record(
        {
          action: AuditAction.DELETE,
          entityType: AuditEntityType.COMMENT,
          entityId: commentId,
          performedBy: performedBy ?? comment.authorId,
          actorType: AuditActor.USER,
        },
        manager,
      );
    });
  }

  private async enrichCommentsWithMentions(
    comments: Comment[],
  ): Promise<CommentResponse[]> {
    if (comments.length === 0) {
      return [];
    }

    const commentIds = comments.map((c) => c.id);
    const mentions = await this.commentMentionRepository.find({
      where: { commentId: In(commentIds) },
      relations: ['user'],
    });

    const byCommentId = new Map<number, MentionedUserSummary[]>();
    for (const mention of mentions) {
      const list = byCommentId.get(mention.commentId) ?? [];
      list.push(toMentionedUser(mention.user));
      byCommentId.set(mention.commentId, list);
    }

    for (const list of byCommentId.values()) {
      list.sort((a, b) => a.id - b.id);
    }

    return comments.map((comment) =>
      toCommentResponse(comment, byCommentId.get(comment.id) ?? []),
    );
  }

  private async syncMentions(
    manager: EntityManager,
    commentId: number,
    content: string,
  ): Promise<MentionedUserSummary[]> {
    const userRepo = manager.getRepository(User);
    const mentionRepo = manager.getRepository(CommentMention);

    const usernames = parseMentionUsernames(content);
    const users = await findUsersByMentionUsernames(userRepo, usernames);
    await mentionRepo.delete({ commentId });

    for (const user of users) {
      await mentionRepo.save(
        mentionRepo.create({ commentId, userId: user.id }),
      );
    }

    return users.map(toMentionedUser);
  }
}
