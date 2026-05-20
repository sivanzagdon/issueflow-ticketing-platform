import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateCommentDto {
  @IsInt()
  @Min(1)
  authorId: number;

  @IsString()
  @IsNotEmpty()
  content: string;
}
