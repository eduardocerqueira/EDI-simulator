import { build997Interchange, buildTA1Interchange, formatIcn, type InterchangeResult } from '@edi/x12';
import { config } from '../config.js';
import { nextSequence, prisma } from '../db.js';
import { mailbox, upload, withFtp } from '../ftp.js';
import { log } from '../log.js';
import { metrics } from '../metrics.js';
import { recordEvent } from '../trace.js';
import { publishEdiEvent } from '../bus.js';

type Partner = { id: string; isaId: string; isaQualifier: string; ftpUser: string; name: string };

/**
 * Generate the acknowledgments for a received interchange:
 *  - TA1 when the interchange was rejected, or when ISA14 = 1 requested it
 *  - one 997 per functional group when the envelope was readable/accepted
 * and queue them for upload to the partner's `from_distributor` folder.
 */
export async function createAcks(interchangeId: string, result: InterchangeResult, partner: Partner): Promise<void> {
  const me = { qualifier: config.identity.isaQualifier, id: config.identity.isaId };
  const them = { qualifier: (result.header?.senderQualifier || partner.isaQualifier), id: partner.isaId };
  const usage = result.header?.usageIndicator === 'P' ? 'P' : 'T';
  const box = mailbox(partner.ftpUser);
  const icnOrig = result.header?.controlNumber || 'unknown';

  if (!result.ok || result.header?.ackRequested === '1') {
    const icn = await nextSequence('outbound-isa', 100000001);
    const content = buildTA1Interchange(result, { sender: me, receiver: them, interchangeControlNumber: icn, usage });
    const fileName = `TA1_${icnOrig}_${formatIcn(icn)}.x12`;
    await prisma.acknowledgment.create({
      data: { interchangeId, type: 'TA1', controlNumber: formatIcn(icn), ackCode: result.ta1.ackCode, fileName, remotePath: `${box.outbound}/${fileName}`, content, status: 'PENDING' },
    });
    await recordEvent({ interchangeId }, 'ACK_GENERATED', 'INFO', `TA1 ${result.ta1.ackCode} (note ${result.ta1.noteCode}) generated`);
  }

  if (result.ok && result.groups.length) {
    const icn = await nextSequence('outbound-isa', 100000001);
    const gcnStart = await nextSequence('outbound-gs', 5001);
    // reserve one GS control number per group
    for (let i = 1; i < result.groups.length; i++) await nextSequence('outbound-gs', 5001);
    const content = build997Interchange(result, { sender: me, receiver: them, interchangeControlNumber: icn, groupControlNumberStart: gcnStart, usage });
    const fileName = `997_${icnOrig}_${formatIcn(icn)}.x12`;
    const codes = result.groups.map((g) => g.ackCode).join('');
    await prisma.acknowledgment.create({
      data: { interchangeId, type: '997', controlNumber: formatIcn(icn), ackCode: codes, fileName, remotePath: `${box.outbound}/${fileName}`, content, status: 'PENDING' },
    });
    await recordEvent({ interchangeId }, 'ACK_GENERATED', 'INFO', `997 generated for ${result.groups.length} group(s): AK9=${codes}`);
  }
}

/** Upload pending acknowledgments (retried on the next cycle when FTP fails). */
export async function sendPendingAcks(): Promise<number> {
  const pending = await prisma.acknowledgment.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: 5 } },
    include: { interchange: { include: { partner: true } } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  if (!pending.length) return 0;
  let sent = 0;
  try {
    await withFtp(async (client) => {
      for (const ack of pending) {
        const started = Date.now();
        try {
          const tmp = `${ack.remotePath}.tmp`;
          await upload(client, tmp, ack.content);
          await client.rename(tmp, ack.remotePath);
          const ft = await prisma.fileTransfer.create({
            data: {
              partnerId: ack.interchange.partnerId, direction: 'OUTBOUND', fileName: ack.fileName, remotePath: ack.remotePath,
              sizeBytes: Buffer.byteLength(ack.content), status: 'SENT', attempts: ack.attempts + 1, content: ack.content, transferredAt: new Date(),
            },
          });
          await prisma.acknowledgment.update({ where: { id: ack.id }, data: { status: 'SENT', attempts: { increment: 1 }, sentAt: new Date(), fileTransferId: ft.id, lastError: null } });
          await recordEvent({ interchangeId: ack.interchangeId, fileTransferId: ft.id }, 'ACK_SENT', 'SUCCESS', `${ack.type} uploaded to ${ack.remotePath}`, { durationMs: Date.now() - started });
          metrics.acksSent.inc({ type: ack.type, code: ack.ackCode });
          await publishEdiEvent({
            routingKey: 'edi.ack.sent', severity: 'INFO', title: `${ack.type} sent`, message: `${ack.type} ${ack.ackCode} sent to ${ack.interchange.partner?.name}`,
            partner: ack.interchange.senderId, interchangeId: ack.interchangeId, interchangeControlNumber: ack.interchange.controlNumber, fileName: ack.fileName,
          });
          sent++;
        } catch (e) {
          await prisma.acknowledgment.update({ where: { id: ack.id }, data: { status: 'FAILED', attempts: { increment: 1 }, lastError: (e as Error).message } });
          await recordEvent({ interchangeId: ack.interchangeId }, 'ACK_SENT', 'RETRY', `Upload of ${ack.fileName} failed: ${(e as Error).message}`);
        }
      }
    });
  } catch (e) {
    metrics.ftpErrors.inc({ operation: 'upload' });
    log.warn(`[acks] FTP unavailable: ${(e as Error).message}`);
  }
  return sent;
}
