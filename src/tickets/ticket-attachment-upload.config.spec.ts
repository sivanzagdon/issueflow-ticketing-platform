import 'reflect-metadata';
import { FileTypeValidator, MaxFileSizeValidator } from '@nestjs/common';
import {
  TICKET_ATTACHMENT_ALLOWED_MIME_REGEX,
  TICKET_ATTACHMENT_MAX_FILE_SIZE,
  ticketAttachmentUploadValidators,
} from './ticket-attachment-upload.config';

describe('ticketAttachmentUploadValidators (Slice 13)', () => {
  const validators = ticketAttachmentUploadValidators();

  it('enforces max file size below 10 MB', () => {
    const maxSize = validators.find((v) => v instanceof MaxFileSizeValidator);
    expect(maxSize).toBeDefined();
    expect(
      (maxSize as MaxFileSizeValidator).isValid({
        size: TICKET_ATTACHMENT_MAX_FILE_SIZE - 1,
      } as Express.Multer.File),
    ).toBe(true);
    expect(
      (maxSize as MaxFileSizeValidator).isValid({
        size: TICKET_ATTACHMENT_MAX_FILE_SIZE,
      } as Express.Multer.File),
    ).toBe(false);
  });

  it('allows required mime types only', async () => {
    const fileType = validators.find((v) => v instanceof FileTypeValidator);
    expect(fileType).toBeDefined();
    const allowed = [
      'image/png',
      'image/jpeg',
      'application/pdf',
      'text/plain',
    ];
    for (const mimetype of allowed) {
      await expect(
        (fileType as FileTypeValidator).isValid({
          mimetype,
        } as Express.Multer.File),
      ).resolves.toBe(true);
    }
    await expect(
      (fileType as FileTypeValidator).isValid({
        mimetype: 'image/gif',
      } as Express.Multer.File),
    ).resolves.toBe(false);
    expect(TICKET_ATTACHMENT_ALLOWED_MIME_REGEX.test('application/octet-stream')).toBe(
      false,
    );
  });
});
