import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  const validPayload = {
    username: 'jdoe',
    password: 'secret',
  };

  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(LoginDto, payload);
    return validate(dto);
  };

  it('accepts valid username and password', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('rejects missing username', async () => {
    const errors = await validateDto({ password: 'secret' });

    expect(errors.some((error) => error.property === 'username')).toBe(true);
  });

  it('rejects missing password', async () => {
    const errors = await validateDto({ username: 'jdoe' });

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('rejects empty username', async () => {
    const errors = await validateDto({ username: '', password: 'secret' });

    expect(errors.some((error) => error.property === 'username')).toBe(true);
  });

  it('rejects empty password', async () => {
    const errors = await validateDto({ username: 'jdoe', password: '' });

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
