import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';
import { UpdateUserDto } from './update-user.dto';

describe('UpdateUserDto', () => {
  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(UpdateUserDto, payload);
    return validate(dto);
  };

  it('accepts updating fullName and role', async () => {
    const errors = await validateDto({
      fullName: 'Jane Doe',
      role: UserRole.ADMIN,
    });

    expect(errors).toHaveLength(0);
  });

  it('accepts a partial update with only fullName', async () => {
    const errors = await validateDto({ fullName: 'Jane Doe' });

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid role', async () => {
    const errors = await validateDto({ role: 'MANAGER' });

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('rejects an empty fullName when provided', async () => {
    const errors = await validateDto({ fullName: '' });

    expect(errors.some((error) => error.property === 'fullName')).toBe(true);
  });
});
