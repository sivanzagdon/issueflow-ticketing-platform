import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { UpdateTicketDto } from './update-ticket.dto';

describe('UpdateTicketDto', () => {
  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(UpdateTicketDto, payload);
    return validate(dto);
  };

  it('accepts a valid partial update payload', async () => {
    const errors = await validateDto({
      version: 1,
      title: 'Updated title',
      description: 'Updated description',
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.MEDIUM,
      assigneeId: 3,
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects payload without version', async () => {
    const errors = await validateDto({
      title: 'Updated title',
    });

    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('rejects empty title when provided', async () => {
    const errors = await validateDto({ version: 1, title: '' });

    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects invalid status', async () => {
    const errors = await validateDto({ version: 1, status: 'INVALID' });

    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects invalid priority', async () => {
    const errors = await validateDto({ version: 1, priority: 'INVALID' });

    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('rejects invalid assigneeId', async () => {
    const errors = await validateDto({ version: 1, assigneeId: 0 });

    expect(errors.some((e) => e.property === 'assigneeId')).toBe(true);
  });

  it('accepts dueDate update', async () => {
    const errors = await validateDto({
      version: 1,
      dueDate: '2026-05-01T00:00:00.000Z',
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects unknown fields when validated through global ValidationPipe settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { version: 1, title: 'Ok', extraField: 'no' },
        { type: 'body', metatype: UpdateTicketDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
