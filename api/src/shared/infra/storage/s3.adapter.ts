import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import type { IStorageService } from '../../contracts/storage.service.contract.js'

type S3AdapterOptions = {
  bucketName: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  publicUrl?: string
}

export class S3Adapter implements IStorageService {
  private readonly client: S3Client
  private readonly bucketName: string
  private readonly publicUrl: string

  constructor(opts: S3AdapterOptions) {
    this.bucketName = opts.bucketName
    this.client = new S3Client({
      region: opts.region,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      ...(opts.endpoint ? { endpoint: opts.endpoint, forcePathStyle: true } : {}),
    })
    this.publicUrl = opts.publicUrl
      ?? `https://${opts.bucketName}.s3.${opts.region}.amazonaws.com`
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }))
    return `${this.publicUrl}/${key}`
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    }))
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.publicUrl}/`
    if (!url.startsWith(prefix)) return null
    return url.slice(prefix.length) || null
  }
}
