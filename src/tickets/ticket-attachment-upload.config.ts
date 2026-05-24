import { FileTypeValidator, MaxFileSizeValidator } from '@nestjs/common';

/** 10 MB — requirements / README attachment upload limit. */
export const TICKET_ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export const TICKET_ATTACHMENT_ALLOWED_MIME_REGEX =
  /^image\/(png|jpeg)$|^application\/pdf$|^text\/plain$/;

export const ticketAttachmentUploadValidators = (): [
  MaxFileSizeValidator,
  FileTypeValidator,
] => [
  new MaxFileSizeValidator({ maxSize: TICKET_ATTACHMENT_MAX_FILE_SIZE }),
  new FileTypeValidator({
    fileType: TICKET_ATTACHMENT_ALLOWED_MIME_REGEX,
    skipMagicNumbersValidation: true,
  }),
];
