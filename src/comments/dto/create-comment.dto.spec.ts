import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentDto } from './create-comment.dto';

describe('CreateCommentDto', () => {
  const validPayload = {
    authorId: 2,
    content: 'Looks good to me.',
  };

  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(CreateCommentDto, payload);
    return validate(dto);
  };

  it('accepts a valid create comment payload', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('rejects missing content', async () => {
    const { content: _c, ...payload } = validPayload;
    const errors = await validateDto(payload);

    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejects empty content', async () => {
    const errors = await validateDto({ ...validPayload, content: '' });

    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejects missing authorId', async () => {
    const { authorId: _a, ...payload } = validPayload;
    const errors = await validateDto(payload);

    expect(errors.some((e) => e.property === 'authorId')).toBe(true);
  });

  it('rejects invalid authorId', async () => {
    const errors = await validateDto({ ...validPayload, authorId: 0 });

    expect(errors.some((e) => e.property === 'authorId')).toBe(true);
  });

  it('rejects unknown fields when validated through global ValidationPipe settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { ...validPayload, extraField: 'nope' },
        { type: 'body', metatype: CreateCommentDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
