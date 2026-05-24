import { IsInt, IsPositive } from 'class-validator';

export class AddTicketDependencyDto {
  @IsInt()
  @IsPositive()
  blockedBy: number;
}
