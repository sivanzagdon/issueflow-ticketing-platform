import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { CommentResponse, toCommentResponse } from './comments.mapper';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    ticketId: number,
    dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    await this.ticketsService.findOne(ticketId);
    await this.usersService.findOne(dto.authorId);

    const comment = this.commentRepository.create({
      ticketId,
      authorId: dto.authorId,
      content: dto.content,
    });

    const saved = await this.commentRepository.save(comment);

    await this.auditLogService.record({
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
    });

    return toCommentResponse({
      ...saved,
      ticketId,
      authorId: dto.authorId,
      content: dto.content,
    });
  }

  async findByTicket(ticketId: number): Promise<CommentResponse[]> {
    await this.ticketsService.findOne(ticketId);

    const comments = await this.commentRepository.find({
      where: { ticketId },
    });
    return comments.map(toCommentResponse);
  }

  async update(
    commentId: number,
    dto: UpdateCommentDto,
    performedBy?: number,
  ): Promise<CommentResponse> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    const beforeContent = comment.content;
    comment.content = dto.content;
    const saved = await this.commentRepository.save(comment);

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.COMMENT,
      entityId: saved.id,
      performedBy: performedBy ?? comment.authorId,
      actorType: AuditActor.USER,
      details: {
        content: { before: beforeContent, after: saved.content },
      },
    });

    return toCommentResponse(saved);
  }

  async remove(commentId: number, performedBy?: number): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    await this.commentRepository.remove(comment);

    await this.auditLogService.record({
      action: AuditAction.DELETE,
      entityType: AuditEntityType.COMMENT,
      entityId: commentId,
      performedBy: performedBy ?? comment.authorId,
      actorType: AuditActor.USER,
    });
  }
}
