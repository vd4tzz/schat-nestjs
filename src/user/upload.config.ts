import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function createUploadOptions() {
  return {
    storage: memoryStorage(),
    fileFilter: (
      _req: Request,
      file: Express.Multer.File,
      cb: FileFilterCallback,
    ) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(
          new BadRequestException('Only JPEG, PNG, WEBP images are allowed'),
        );
      }
      cb(null, true);
    },
    limits: { fileSize: MAX_FILE_SIZE },
  };
}
