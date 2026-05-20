import { Injectable } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponse } from './comments.mapper';

/**
 * Slice 6 — implementation pending. Tests drive behavior; methods throw until implemented.
 */
@Injectable()
export class CommentsService {
  async create(_ticketId: number, _dto: CreateCommentDto): Promise<CommentResponse> {
    throw new Error('Not implemented');
  }

  async findByTicket(_ticketId: number): Promise<CommentResponse[]> {
    throw new Error('Not implemented');
  }

  async update(_commentId: number, _dto: UpdateCommentDto): Promise<CommentResponse> {
    throw new Error('Not implemented');
  }

  async remove(_commentId: number): Promise<void> {
    throw new Error('Not implemented');
  }
}
