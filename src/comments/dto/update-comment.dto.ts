import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class UpdateCommentDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @IsNotEmpty()
  content: string;
}
