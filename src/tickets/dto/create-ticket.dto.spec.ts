import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketType } from '../../common/enums/ticket-type.enum';
import { CreateTicketDto } from './create-ticket.dto';

describe('CreateTicketDto', () => {
  const validPayload = {
    title: 'Fix login bug',
    description: 'Details',
    status: TicketStatus.TODO,
    priority: TicketPriority.HIGH,
    type: TicketType.BUG,
    projectId: 1,
    assigneeId: 2,
    dueDate: '2026-04-01T00:00:00.000Z',
  };

  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(CreateTicketDto, payload);
    return validate(dto);
  };

  it('accepts a valid create ticket payload', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('accepts payload without assigneeId and dueDate', async () => {
    const { assigneeId: _a, dueDate: _d, ...minimal } = validPayload;
    const errors = await validateDto(minimal);

    expect(errors).toHaveLength(0);
  });

  it('rejects missing title', async () => {
    const { title: _t, ...payload } = validPayload;
    const errors = await validateDto(payload);

    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects empty title', async () => {
    const errors = await validateDto({ ...validPayload, title: '' });

    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects missing projectId', async () => {
    const { projectId: _p, ...payload } = validPayload;
    const errors = await validateDto(payload);

    expect(errors.some((e) => e.property === 'projectId')).toBe(true);
  });

  it('rejects invalid projectId', async () => {
    const errors = await validateDto({ ...validPayload, projectId: 0 });

    expect(errors.some((e) => e.property === 'projectId')).toBe(true);
  });

  it('rejects invalid status', async () => {
    const errors = await validateDto({ ...validPayload, status: 'INVALID' });

    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects invalid priority', async () => {
    const errors = await validateDto({ ...validPayload, priority: 'INVALID' });

    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('rejects invalid type', async () => {
    const errors = await validateDto({ ...validPayload, type: 'INVALID' });

    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejects invalid dueDate', async () => {
    const errors = await validateDto({ ...validPayload, dueDate: 'not-a-date' });

    expect(errors.some((e) => e.property === 'dueDate')).toBe(true);
  });
});
