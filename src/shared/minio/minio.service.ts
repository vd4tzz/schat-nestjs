import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'schat');
    this.publicUrl = this.config.get<string>(
      'MINIO_PUBLIC_URL',
      'http://localhost:9000',
    );

    this.client = new Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.config.get<string>('MINIO_PORT', '9000')),
      useSSL: this.config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });

    await this.ensureBucket();
  }

  private async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      await this.client.setBucketPolicy(
        this.bucket,
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucket}/*`],
            },
          ],
        }),
      );
      this.logger.log(
        `Bucket "${this.bucket}" created with public read policy`,
      );
    }
  }

  async upload(folder: string, file: Express.Multer.File): Promise<string> {
    const ext = extname(file.originalname).toLowerCase();
    const objectName = `${folder}/${randomUUID()}${ext}`;

    await this.client.putObject(
      this.bucket,
      objectName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    return `${this.publicUrl}/${this.bucket}/${objectName}`;
  }

  async delete(fileUrl: string): Promise<void> {
    try {
      const objectName = this.extractObjectName(fileUrl);
      if (objectName) {
        await this.client.removeObject(this.bucket, objectName);
      }
    } catch {
      // silently ignore deletion errors
    }
  }

  private extractObjectName(fileUrl: string): string | null {
    try {
      const prefix = `${this.publicUrl}/${this.bucket}/`;
      if (fileUrl.startsWith(prefix)) {
        return fileUrl.slice(prefix.length);
      }
      return null;
    } catch {
      return null;
    }
  }
}
