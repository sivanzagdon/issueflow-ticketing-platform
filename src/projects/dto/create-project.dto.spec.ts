import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';

describe('CreateProjectDto', () => {
  const validPayload = {
    name: 'Sample Project',
    description: 'A sample project',
    ownerId: 1,
  };

  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(CreateProjectDto, payload);
    return validate(dto);
  };

  it('accepts a valid create project payload', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('accepts create payload without description', async () => {
    const { description: _description, ...payloadWithoutDescription } =
      validPayload;
    const errors = await validateDto(payloadWithoutDescription);

    expect(errors).toHaveLength(0);
  });

  it('rejects missing name', async () => {
    const { name: _name, ...payload } = validPayload;
    const errors = await validateDto(payload);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects empty name', async () => {
    const errors = await validateDto({ ...validPayload, name: '' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects missing ownerId', async () => {
    const { ownerId: _ownerId, ...payload } = validPayload;
    const errors = await validateDto(payload);

    expect(errors.some((error) => error.property === 'ownerId')).toBe(true);
  });

  it('rejects invalid ownerId', async () => {
    const errors = await validateDto({ ...validPayload, ownerId: 0 });

    expect(errors.some((error) => error.property === 'ownerId')).toBe(true);
  });
});
