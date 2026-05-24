import { IsNotEmpty, IsString } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Expected CreateTicketAttachmentDto contract (Slice 13).
 * Replace with production import once implemented.
 */
class CreateTicketAttachmentDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;
}

describe('CreateTicketAttachmentDto (Slice 13 contract)', () => {
  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(CreateTicketAttachmentDto, payload);
    return validate(dto);
  };

  it('accepts valid filename and contentType', async () => {
    const errors = await validateDto({
      filename: 'screenshot.png',
      contentType: 'image/png',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects missing filename', async () => {
    const errors = await validateDto({ contentType: 'image/png' });
    expect(errors.some((e) => e.property === 'filename')).toBe(true);
  });

  it('rejects empty filename', async () => {
    const errors = await validateDto({ filename: '', contentType: 'image/png' });
    expect(errors.some((e) => e.property === 'filename')).toBe(true);
  });

  it('rejects missing contentType', async () => {
    const errors = await validateDto({ filename: 'screenshot.png' });
    expect(errors.some((e) => e.property === 'contentType')).toBe(true);
  });

  it('rejects empty contentType', async () => {
    const errors = await validateDto({
      filename: 'screenshot.png',
      contentType: '',
    });
    expect(errors.some((e) => e.property === 'contentType')).toBe(true);
  });
});
