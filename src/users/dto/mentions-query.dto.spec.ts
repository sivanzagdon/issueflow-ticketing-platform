import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MentionsQueryDto } from './mentions-query.dto';

describe('MentionsQueryDto', () => {
  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(MentionsQueryDto, payload);
    return validate(dto);
  };

  it('accepts empty query (defaults applied at service layer)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('accepts valid page and pageSize', async () => {
    const errors = await validateDto({ page: 2, pageSize: 25 });
    expect(errors).toHaveLength(0);
  });

  it('rejects non-number page', async () => {
    const errors = await validateDto({ page: 'one' });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects zero page', async () => {
    const errors = await validateDto({ page: 0 });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects negative page', async () => {
    const errors = await validateDto({ page: -1 });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects non-number pageSize', async () => {
    const errors = await validateDto({ pageSize: 'many' });
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('rejects zero pageSize', async () => {
    const errors = await validateDto({ pageSize: 0 });
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('rejects pageSize above maximum', async () => {
    const errors = await validateDto({ pageSize: 101 });
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });
});
