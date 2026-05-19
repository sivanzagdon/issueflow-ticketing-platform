import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  const validPayload = {
    username: 'jdoe',
    email: 'jdoe@example.com',
    fullName: 'John Doe',
    role: UserRole.DEVELOPER,
  };

  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(CreateUserDto, payload);
    return validate(dto);
  };

  it('accepts a valid create user payload', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('accepts an optional password when provided', async () => {
    const errors = await validateDto({
      ...validPayload,
      password: 'secret123',
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const errors = await validateDto({
      ...validPayload,
      email: 'not-an-email',
    });

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('rejects an invalid role', async () => {
    const errors = await validateDto({
      ...validPayload,
      role: 'MANAGER',
    });

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('rejects missing required fields', async () => {
    const errors = await validateDto({});

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['username', 'email', 'fullName', 'role']),
    );
  });

  it('rejects a password shorter than 8 characters when provided', async () => {
    const errors = await validateDto({
      ...validPayload,
      password: 'short',
    });

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
