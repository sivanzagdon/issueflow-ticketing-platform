import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProjectDto } from './update-project.dto';

describe('UpdateProjectDto', () => {
  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(UpdateProjectDto, payload);
    return validate(dto);
  };

  it('accepts a valid partial update payload', async () => {
    const errors = await validateDto({
      name: 'Updated Name',
      description: 'Updated description',
    });

    expect(errors).toHaveLength(0);
  });

  it('accepts description-only update', async () => {
    const errors = await validateDto({
      description: 'Updated description only',
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects empty name when provided', async () => {
    const errors = await validateDto({ name: '' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects unknown fields when validated through global ValidationPipe settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { name: 'Updated Name', unknownField: 'not-allowed' },
        { type: 'body', metatype: UpdateProjectDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
