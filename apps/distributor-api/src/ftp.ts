import { createHash } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { Client } from 'basic-ftp';
import { config } from './config.js';
import { prisma } from './db.js';
import { log } from './log.js';
import { metrics } from './metrics.js';
import { recordEvent } from './trace.js';

/**
 * FTP mailbox layout (one folder per trading partner, distributor sees all):
 *
 *   /<partner>/to_distributor/    producer uploads X12 here (inbound)
 *   /<partner>/from_distributor/  distributor drops TA1 / 997 here (outbound)
 *   /<partner>/archive/           distributor moves processed inbound files here
 *   /<partner>/error/             files that could not be downloaded after N attempts
 */
export const mailbox = (ftpUser: string) => ({
  inbound: `/${ftpUser}/to_distributor`,
  outbound: `/${ftpUser}/from_distributor`,
  archive: `/${ftpUser}/archive`,
  error: `/${ftpUser}/error`,
});

export async function withFtp<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client(15_000);
  try {
    await client.access({ host: config.ftp.host, port: config.ftp.port, user: config.ftp.user, password: config.ftp.password, secure: false });
    return await fn(client);
  } finally {
    client.close();
  }
}

async function download(client: Client, path: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  await client.downloadTo(sink, path);
  return Buffer.concat(chunks);
}

export async function upload(client: Client, path: string, content: string): Promise<void> {
  await client.uploadFrom(Readable.from(Buffer.from(content, 'utf8')), path);
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');

/**
 * One polling cycle: list every partner inbox, download new files, archive
 * them on the server and hand them to the processing pipeline.
 */
export async function pollInboxes(onFile: (fileTransferId: string) => Promise<void>): Promise<number> {
  const partners = await prisma.tradingPartner.findMany({ where: { active: true } });
  let count = 0;
  await withFtp(async (client) => {
    for (const partner of partners) {
      const box = mailbox(partner.ftpUser);
      let entries;
      try {
        entries = await client.list(box.inbound);
      } catch (e) {
        metrics.ftpErrors.inc({ operation: 'list' });
        log.warn(`[ftp] cannot list ${box.inbound}: ${(e as Error).message}`);
        continue;
      }
      // Producers upload as *.tmp then rename, so partial uploads are never picked up.
      for (const entry of entries.filter((f) => f.isFile && !f.name.startsWith('.') && !f.name.endsWith('.tmp'))) {
        const remotePath = `${box.inbound}/${entry.name}`;
        let ft = await prisma.fileTransfer.findFirst({ where: { remotePath, status: { in: ['DISCOVERED', 'RETRYING'] } } });
        ft ??= await prisma.fileTransfer.create({
          data: { partnerId: partner.id, direction: 'INBOUND', fileName: entry.name, remotePath, sizeBytes: entry.size, status: 'DISCOVERED' },
        });
        if (ft.attempts === 0) await recordEvent({ fileTransferId: ft.id }, 'FILE_DISCOVERED', 'INFO', `Found ${entry.name} (${entry.size} bytes) in ${box.inbound}`);
        const started = Date.now();
        try {
          const buf = await download(client, remotePath);
          const archivePath = `${box.archive}/${stamp()}_${entry.name}`;
          await client.rename(remotePath, archivePath);
          const content = buf.toString('utf8');
          ft = await prisma.fileTransfer.update({
            where: { id: ft.id },
            data: {
              status: 'DOWNLOADED', attempts: { increment: 1 }, content, sizeBytes: buf.length,
              sha256: createHash('sha256').update(buf).digest('hex'), archivePath, transferredAt: new Date(), lastError: null,
            },
          });
          metrics.filesReceived.inc({ partner: partner.isaId });
          await recordEvent({ fileTransferId: ft.id }, 'DOWNLOADED', 'SUCCESS', `Downloaded via FTP and archived to ${archivePath}`, { durationMs: Date.now() - started, details: { sha256: ft.sha256, sizeBytes: buf.length, attempt: ft.attempts } });
          count++;
        } catch (e) {
          metrics.ftpErrors.inc({ operation: 'download' });
          const attempts = ft.attempts + 1;
          const failed = attempts >= config.ftp.maxDownloadAttempts;
          await prisma.fileTransfer.update({ where: { id: ft.id }, data: { attempts, status: failed ? 'FAILED' : 'RETRYING', lastError: (e as Error).message } });
          await recordEvent({ fileTransferId: ft.id }, 'DOWNLOAD', failed ? 'FAILURE' : 'RETRY', `Download attempt ${attempts} failed: ${(e as Error).message}`);
          if (failed) await client.rename(remotePath, `${box.error}/${stamp()}_${entry.name}`).catch(() => undefined);
          continue;
        }
        // Processing errors are handled (and traced) inside the pipeline itself.
        await onFile(ft.id).catch((e) => log.error(`[pipeline] ${ft!.fileName}`, e));
      }
    }
  });
  return count;
}
