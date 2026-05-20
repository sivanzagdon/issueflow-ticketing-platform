import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketType } from '../../common/enums/ticket-type.enum';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TicketStatus)
  status: TicketStatus;

  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @IsEnum(TicketType)
  type: TicketType;

  @IsInt()
  @Min(1)
  projectId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  assigneeId?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
