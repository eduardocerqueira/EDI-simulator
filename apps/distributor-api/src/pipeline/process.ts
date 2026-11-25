import { ROUTING_KEYS } from '@edi/shared';
import {
  analyzeInterchange,
  detectDelimiters,
  el,
  mapTransaction,
  tokenize,
  transactionDocument,
  type InterchangeResult,
  type X12Issue,
} from '@edi/x12';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { log } from '../log.js';
import { metrics } from '../metrics.js';
import { publishEdiEvent } from '../bus.js';
import { recordEvent, saveIssues } from '../trace.js';
import { createAcks } from './acks.js';
import { ingest, validateBusiness } from './business.js';

const summarize = (issues: X12Issue[]) =>
  issues.filter((i) => i.severity === 'ERROR').slice(0, 10).map((i) => ({ code: i.code, x12Code: i.x12Code, message: i.message }));

/** Peek at ISA06/ISA13 to check for duplicates before full validation. */
async function isDuplicate(raw: string): Promise<boolean> {
  try {
    const { delimiters } = detectDelimiters(raw);
    const isa = tokenize(raw.slice(0, 200), delimiters)[0];
    const senderId = el(isa, 6);
    const icn = el(isa, 13);
    if (!senderId || !icn) return false;
    const prior = await prisma.interchange.count({ where: { senderId, controlNumber: icn, status: { notIn: ['ERROR'] } } });
    return prior > 0;
  } catch {
    return false;
  }
}

/**
 * The inbound pipeline for one file:
 *
 *  PARSE → ENVELOPE (TA1) → GROUP (AK9) → TRANSACTION/SEGMENT/ELEMENT (AK5/AK3/AK4)
 *        → BUSINESS RULES → MAP to JSON → INGEST into inventory → queue REST delivery
 *        → generate TA1/997 → publish events to RabbitMQ
 */
export async function processFile(fileTransferId: string): Promise<void> {
  const started = Date.now();
  const file = await prisma.fileTransfer.findUniqueOrThrow({ where: { id: fileTransferId }, include: { partner: true } });
  const partner = file.partner!;
  const raw = file.content ?? '';
  const ref = { fileTransferId };

  const duplicate = await isDuplicate(raw);
  let result: InterchangeResult;
  try {
    result = analyzeInterchange(raw, {
      receiverIds: [config.identity.isaId],
      // The mailbox a file arrives in identifies the partner: ISA06 must match it.
      knownSenderIds: [partner.isaId],
      isDuplicate: () => duplicate,
    });
  } catch (e) {
    await prisma.fileTransfer.update({ where: { id: file.id }, data: { status: 'FAILED', lastError: (e as Error).message, processedAt: new Date() } });
    await recordEvent(ref, 'PARSED', 'FAILURE', `Unexpected parser failure: ${(e as Error).message}`);
    throw e;
  }

  const h = result.header;
  const parsed = result.parsed;
  const interchange = await prisma.interchange.create({
    data: {
      fileTransferId: file.id,
      partnerId: partner.id,
      senderQualifier: h?.senderQualifier ?? '',
      senderId: h?.senderId ?? '',
      receiverQualifier: h?.receiverQualifier ?? '',
      receiverId: h?.receiverId ?? '',
      controlNumber: h?.controlNumber ?? '',
      interchangeDate: h?.date ?? '',
      interchangeTime: h?.time ?? '',
      version: h?.version ?? '',
      usageIndicator: h?.usageIndicator ?? '',
      ackRequested: h?.ackRequested ?? '',
      elementSeparator: result.delimiters?.element ?? '',
      componentSeparator: result.delimiters?.component ?? '',
      segmentTerminator: result.delimiters?.segment ?? '',
      isaLength: result.isaLength,
      declaredGroupCount: result.declaredGroupCount,
      trailerControlNumber: result.trailerControlNumber,
      groupCount: result.groups.length,
      transactionCount: result.groups.reduce((n, g) => n + g.transactions.length, 0),
      segmentCount: parsed?.segments.length ?? 0,
      status: 'RECEIVED',
      ta1AckCode: result.ta1.ackCode,
      ta1NoteCode: result.ta1.noteCode,
      rawIsa: parsed?.isa.raw,
      rawIea: parsed?.iea?.raw,
      receivedAt: file.transferredAt ?? new Date(),
    },
  });
  const icRef = { fileTransferId: file.id, interchangeId: interchange.id };
  const label = `${partner.name} ICN ${h?.controlNumber ?? '?'}`;

  try {
    await recordEvent(icRef, 'PARSED', result.parseError ? 'FAILURE' : 'SUCCESS',
      result.parseError
        ? `Could not read interchange: ${result.parseError.message}`
        : `Delimiters element "${result.delimiters!.element}" component "${result.delimiters!.component}" segment "${result.delimiters!.segment}" — ${parsed!.segments.length} segments, ${result.groups.length} group(s)`);

    await saveIssues({ interchangeId: interchange.id }, result.issues);
    await recordEvent(icRef, 'ENVELOPE_VALIDATED', result.ok ? 'SUCCESS' : 'FAILURE',
      result.ok ? 'ISA/IEA envelope is valid (TA1 A / 000)' : `Interchange rejected: TA1 R / ${result.ta1.noteCode} — ${result.issues[0]?.message}`,
      { details: { ta1: result.ta1 } });

    let accepted = 0;
    let errorCount = result.issues.length;
    for (const g of result.groups) {
      const pg = parsed!.groups[g.index]!;
      const group = await prisma.functionalGroup.create({
        data: {
          interchangeId: interchange.id, index: g.index, functionalId: g.functionalId, senderCode: g.senderCode, receiverCode: g.receiverCode,
          date: g.date, time: g.time, controlNumber: g.controlNumber, version: g.version, declaredTransactionCount: g.declaredTransactionCount,
          transactionCount: g.transactions.length, acceptedCount: result.ok ? g.acceptedCount : 0, ackCode: result.ok ? g.ackCode : 'R',
          ak9Codes: g.ak9Codes, rawGs: pg.gs.raw, rawGe: pg.ge?.raw,
        },
      });
      await saveIssues({ interchangeId: interchange.id, groupId: group.id }, g.issues);
      errorCount += g.issues.length;
      const groupRejected = g.issues.some((i) => i.severity === 'ERROR');

      for (const t of g.transactions) {
        const body = pg.transactions[t.index]!.body;
        let status = !result.ok ? 'ENVELOPE_REJECTED' : groupRejected || t.ackCode === 'R' ? 'SYNTAX_REJECTED' : 'RECEIVED';
        const doc = transactionDocument(result, g, t);
        const normalized = status === 'RECEIVED' ? mapTransaction(t.type, body) : undefined;
        const txn = await prisma.transactionSet.create({
          data: {
            interchangeId: interchange.id, groupId: group.id, partnerId: partner.id, index: t.index, type: t.type, typeName: t.typeName,
            controlNumber: t.controlNumber, segmentCount: t.segmentCount, declaredSegmentCount: t.declaredSegmentCount, status,
            ackCode: result.ok ? (groupRejected ? 'R' : t.ackCode) : null, ak5Codes: t.ak5Codes, raw: t.raw, x12Json: doc as object,
            normalizedJson: (normalized as object) ?? undefined, errorCount: t.issues.length, validatedAt: new Date(),
            itemCount: normalized ? (normalized.type === '856' ? normalized.orders.reduce((n, o) => n + o.items.length, 0) : normalized.items.length) : 0,
          },
        });
        const tRef = { ...icRef, transactionId: txn.id };
        await saveIssues({ interchangeId: interchange.id, groupId: group.id, transactionId: txn.id }, t.issues);
        errorCount += t.issues.length;
        const txLabel = `${t.type} #${t.controlNumber} from ${partner.name}`;

        if (status === 'ENVELOPE_REJECTED') {
          await recordEvent(tRef, 'SYNTAX_VALIDATED', 'INFO', 'Not processed: the interchange envelope was rejected');
        } else if (status === 'SYNTAX_REJECTED') {
          const why = groupRejected ? `functional group rejected (AK9 ${g.ak9Codes.join(',')})` : `AK5 R ${t.ak5Codes.join(',')}`;
          await recordEvent(tRef, 'SYNTAX_VALIDATED', 'FAILURE', `Syntax validation failed: ${why} — ${t.issues.length} issue(s)`, { details: { issues: summarize(t.issues) } });
          await publishEdiEvent({
            routingKey: ROUTING_KEYS.validationFailed, severity: 'ERROR', title: `Invalid ${t.type} rejected`,
            message: `${txLabel}: ${(t.issues[0] ?? g.issues[0])?.message ?? 'syntax errors'}`, partner: partner.isaId,
            interchangeId: interchange.id, interchangeControlNumber: h?.controlNumber, transactionId: txn.id, transactionType: t.type,
            fileName: file.fileName, errors: summarize([...g.issues, ...t.issues]),
          });
        } else {
          await recordEvent(tRef, 'SYNTAX_VALIDATED', 'SUCCESS', `Syntax valid (997 AK5 A) — ${t.segmentCount} segments`);
          await recordEvent(tRef, 'MAPPED', 'SUCCESS', `Mapped X12 → JSON (${txn.itemCount} item(s))`);
          const bizIssues = await validateBusiness(normalized!, partner);
          if (bizIssues.length) {
            status = 'BUSINESS_REJECTED';
            await saveIssues({ interchangeId: interchange.id, groupId: group.id, transactionId: txn.id }, bizIssues);
            errorCount += bizIssues.length;
            await prisma.transactionSet.update({ where: { id: txn.id }, data: { status, errorCount: { increment: bizIssues.length } } });
            await recordEvent(tRef, 'BUSINESS_VALIDATED', 'FAILURE', `Business rules failed: ${bizIssues[0]!.message}`, { details: { issues: summarize(bizIssues) } });
            await publishEdiEvent({
              routingKey: ROUTING_KEYS.businessRejected, severity: 'WARNING', title: `${t.type} failed business validation`,
              message: `${txLabel}: ${bizIssues[0]!.message}${bizIssues.length > 1 ? ` (+${bizIssues.length - 1} more)` : ''}`, partner: partner.isaId,
              interchangeId: interchange.id, interchangeControlNumber: h?.controlNumber, transactionId: txn.id, transactionType: t.type,
              fileName: file.fileName, errors: summarize(bizIssues),
            });
          } else {
            await recordEvent(tRef, 'BUSINESS_VALIDATED', 'SUCCESS', 'All business rules passed');
            const t0 = Date.now();
            const items = await prisma.$transaction(async (tx) => {
              const items = await ingest(tx, normalized!, partner, txn.id);
              await tx.transactionSet.update({ where: { id: txn.id }, data: { status: 'INGESTED', ingestedAt: new Date() } });
              await tx.apiDelivery.create({
                data: {
                  transactionId: txn.id,
                  status: 'PENDING',
                  endpoint: `${config.orderApi.url}/api/integration/inventory`,
                  maxAttempts: config.delivery.maxAttempts,
                  payload: {
                    transactionId: txn.id,
                    transactionType: t.type,
                    envelope: { interchangeControlNumber: h!.controlNumber, groupControlNumber: g.controlNumber, transactionControlNumber: t.controlNumber, senderId: h!.senderId, receivedAt: interchange.receivedAt.toISOString() },
                    producer: { code: partner.code, name: partner.name, isaId: partner.isaId },
                    items,
                  },
                },
              });
              return items;
            });
            status = 'INGESTED';
            accepted++;
            await recordEvent(tRef, 'INGESTED', 'SUCCESS', `Inventory updated for ${items.length} product(s); REST delivery to order app queued`, { durationMs: Date.now() - t0 });
            await publishEdiEvent({
              routingKey: ROUTING_KEYS.transactionIngested, severity: 'INFO', title: `${t.type} ingested`, message: `${txLabel}: ${items.length} product(s) updated`,
              partner: partner.isaId, interchangeId: interchange.id, interchangeControlNumber: h?.controlNumber, transactionId: txn.id, transactionType: t.type,
            });
          }
        }
        metrics.transactions.inc({ type: t.type || 'unknown', status });
      }
    }

    const total = interchange.transactionCount;
    const finalStatus = !result.ok ? 'REJECTED' : accepted === total && total > 0 ? 'ACCEPTED' : accepted === 0 ? 'REJECTED' : 'PARTIALLY_ACCEPTED';
    await createAcks(interchange.id, result, partner);
    const processingMs = Date.now() - started;
    await prisma.interchange.update({ where: { id: interchange.id }, data: { status: finalStatus, acceptedCount: accepted, errorCount, processedAt: new Date(), processingMs } });
    await prisma.fileTransfer.update({ where: { id: file.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
    await recordEvent(icRef, 'COMPLETED', finalStatus === 'ACCEPTED' ? 'SUCCESS' : finalStatus === 'REJECTED' ? 'FAILURE' : 'INFO',
      `Interchange ${finalStatus.toLowerCase().replace('_', ' ')}: ${accepted}/${total} transaction set(s) ingested`, { durationMs: processingMs });
    metrics.interchanges.inc({ partner: partner.isaId, status: finalStatus });
    metrics.processingDuration.observe(processingMs / 1000);

    if (!result.ok) {
      await publishEdiEvent({
        routingKey: ROUTING_KEYS.interchangeRejected, severity: 'ERROR', title: 'Interchange rejected (TA1)',
        message: `${label}: TA1 R/${result.ta1.noteCode} — ${result.issues[0]?.message ?? 'envelope error'}`, partner: partner.isaId,
        interchangeId: interchange.id, interchangeControlNumber: h?.controlNumber, fileName: file.fileName, errors: summarize(result.issues),
      });
    } else if (finalStatus === 'ACCEPTED') {
      await publishEdiEvent({
        routingKey: ROUTING_KEYS.interchangeAccepted, severity: 'INFO', title: 'Interchange accepted', message: `${label}: ${accepted} transaction set(s) ingested`,
        partner: partner.isaId, interchangeId: interchange.id, interchangeControlNumber: h?.controlNumber, fileName: file.fileName,
      });
    }
    log.info(`[pipeline] ${file.fileName} → ${finalStatus} (${accepted}/${total}) in ${processingMs}ms`);
  } catch (e) {
    log.error(`[pipeline] failed processing ${file.fileName}`, e);
    await prisma.interchange.update({ where: { id: interchange.id }, data: { status: 'ERROR', processedAt: new Date(), processingMs: Date.now() - started } });
    await prisma.fileTransfer.update({ where: { id: file.id }, data: { status: 'FAILED', lastError: (e as Error).message } });
    await recordEvent(icRef, 'FAILED', 'FAILURE', `Processing error: ${(e as Error).message}`);
    await publishEdiEvent({
      routingKey: ROUTING_KEYS.transactionFailed, severity: 'ERROR', title: 'EDI processing failed', message: `${label}: ${(e as Error).message}`,
      partner: partner.isaId, interchangeId: interchange.id, interchangeControlNumber: h?.controlNumber, fileName: file.fileName,
    });
  }
}
