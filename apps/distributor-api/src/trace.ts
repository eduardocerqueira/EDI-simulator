import type { X12Issue } from '@edi/x12';
import { prisma } from './db.js';
import { metrics } from './metrics.js';

export interface EventRef {
  fileTransferId?: string | null;
  interchangeId?: string | null;
  transactionId?: string | null;
}

/** Append a step to the processing timeline (the "audit trail" of an envelope). */
export async function recordEvent(
  ref: EventRef,
  stage: string,
  status: 'SUCCESS' | 'FAILURE' | 'INFO' | 'RETRY',
  message: string,
  extra: { details?: unknown; durationMs?: number } = {},
) {
  await prisma.processingEvent.create({
    data: {
      fileTransferId: ref.fileTransferId ?? undefined,
      interchangeId: ref.interchangeId ?? undefined,
      transactionId: ref.transactionId ?? undefined,
      stage,
      status,
      message,
      details: (extra.details as object) ?? undefined,
      durationMs: extra.durationMs,
    },
  });
}

export async function saveIssues(
  ref: { interchangeId: string; groupId?: string; transactionId?: string },
  issues: X12Issue[],
) {
  if (!issues.length) return;
  for (const i of issues) metrics.validationErrors.inc({ level: i.level, code: i.code });
  await prisma.validationIssue.createMany({
    data: issues.map((i) => ({
      interchangeId: ref.interchangeId,
      groupId: ref.groupId,
      transactionId: ref.transactionId,
      level: i.level,
      severity: i.severity,
      code: i.code,
      x12Code: i.x12Code,
      x12CodeSource: i.x12CodeSource,
      message: i.message,
      segmentId: i.segmentId,
      segmentPosition: i.segmentPosition,
      elementPosition: i.elementPosition,
      elementRef: i.elementRef,
      badValue: i.badValue?.slice(0, 200),
      loopId: i.loopId,
    })),
  });
}
