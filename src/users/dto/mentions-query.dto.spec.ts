import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Slice 11 contract — replace with import from ./mentions-query.dto after implementation.
 * Validates README query params: optional page, pageSize.
 */
export class MentionsQueryDtoContract {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

describe('MentionsQueryDto (Slice 11 contract)', () => {
  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(MentionsQueryDtoContract, payload);
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
