import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { Config } from "./config.js";

export class ScreenshotStorage {
  private readonly client: S3Client;

  constructor(private readonly config: Config) {
    this.client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
      // MinIO serves buckets as a path segment, not as a DNS subdomain.
      forcePathStyle: true,
    });
  }

  /**
   * One object per subdomain per run date. Re-running the same night overwrites
   * rather than piling up, which keeps the bucket's lifecycle rule predictable.
   */
  static objectKey(label: string, scannedAt: Date): string {
    const day = scannedAt.toISOString().slice(0, 10);
    return `${day}/${label}.png`;
  }

  async upload(key: string, body: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.s3.bucket,
        Key: key,
        Body: body,
        ContentType: "image/png",
      }),
    );
  }
}
