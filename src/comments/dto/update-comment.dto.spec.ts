import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCommentDto } from './update-comment.dto';

describe('UpdateCommentDto', () => {
  const validPayload = {
    content: 'Updated comment text.',
  };

  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(UpdateCommentDto, payload);
    return validate(dto);
  };

  it('accepts a valid update payload', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('rejects empty content', async () => {
    const errors = await validateDto({ content: '' });

    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejects missing content', async () => {
    const errors = await validateDto({});

    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejects unknown fields when validated through global ValidationPipe settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { ...validPayload, sneaky: true },
        { type: 'body', metatype: UpdateCommentDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
