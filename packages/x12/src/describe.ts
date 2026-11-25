import { getSegmentSpec } from './specs/segments.js';
import { getTransactionSpec } from './specs/transactions.js';
import { describeAckCode } from './codes.js';
import type { Segment, X12Issue } from './types.js';
import type { GroupResult, InterchangeResult, TransactionResult } from './validator.js';

/** Envelope layer a segment belongs to (for colouring in the inspector). */
export type EnvelopeLayer = 'interchange' | 'group' | 'transaction' | 'detail';

export interface DescribedElement {
  /** e.g. `ISA06`. */
  position: string;
  ref?: string;
  name?: string;
  value: string;
  codeDescription?: string;
}

export interface DescribedSegment {
  position: number;
  id: string;
  name?: string;
  purpose?: string;
  layer: EnvelopeLayer;
  raw: string;
  elements: DescribedElement[];
  issues: X12Issue[];
}

export function layerOf(id: string): EnvelopeLayer {
  if (id === 'ISA' || id === 'IEA' || id === 'TA1') return 'interchange';
  if (id === 'GS' || id === 'GE') return 'group';
  if (id === 'ST' || id === 'SE') return 'transaction';
  return 'detail';
}

export function describeSegment(segment: Segment, issues: X12Issue[] = []): DescribedSegment {
  const spec = getSegmentSpec(segment.id);
  return {
    position: segment.position,
    id: segment.id,
    name: spec?.name,
    purpose: spec?.purpose,
    layer: layerOf(segment.id),
    raw: segment.raw,
    issues,
    elements: segment.elements.slice(1).map((value, i) => {
      const e = spec?.elements[i];
      const v = segment.id === 'ISA' ? value : value.trim();
      return {
        position: `${segment.id}${String(i + 1).padStart(2, '0')}`,
        ref: e?.ref,
        name: e?.name,
        value,
        codeDescription: e?.codes?.[v],
      };
    }),
  };
}

/** Attach issues to the interchange-level segment positions they refer to. */
function issuesBySegment(result: InterchangeResult): Map<number, X12Issue[]> {
  const map = new Map<number, X12Issue[]>();
  const add = (pos: number | undefined, i: X12Issue) => {
    if (!pos) return;
    map.set(pos, [...(map.get(pos) ?? []), i]);
  };
  for (const i of result.issues) add(i.segmentPosition, i);
  for (const g of result.groups) {
    for (const i of g.issues) add(i.segmentPosition, i);
    for (const t of g.transactions) {
      for (const i of t.issues) add(i.segmentPosition ? t.startPosition + i.segmentPosition - 1 : undefined, i);
    }
  }
  return map;
}

export interface InspectionReport {
  ok: boolean;
  summary: string;
  segments: DescribedSegment[];
  result: Omit<InterchangeResult, 'parsed'>;
}

export function inspectionReport(result: InterchangeResult): InspectionReport {
  const map = issuesBySegment(result);
  const segments = result.parsed?.segments.map((s) => describeSegment(s, map.get(s.position) ?? [])) ?? [];
  const { parsed: _parsed, ...rest } = result;
  const total = result.groups.reduce((n, g) => n + g.transactions.length, 0);
  const accepted = result.groups.reduce((n, g) => n + g.transactions.filter((t) => t.ackCode === 'A').length, 0);
  const summary = result.parseError
    ? `Unreadable interchange: ${result.parseError.message}`
    : `TA1 ${result.ta1.ackCode} (${result.ta1.noteCode} ${describeAckCode('TA1', result.ta1.noteCode) ?? ''}) — ${result.groups.length} group(s), ${accepted}/${total} transaction set(s) accepted`;
  return { ok: result.ok && accepted === total, summary, segments, result: rest };
}

/** All issues flattened with their location (for listings and notifications). */
export function flattenIssues(result: InterchangeResult): Array<X12Issue & { groupIndex?: number; transactionIndex?: number }> {
  const out: Array<X12Issue & { groupIndex?: number; transactionIndex?: number }> = [...result.issues];
  result.groups.forEach((g: GroupResult) => {
    out.push(...g.issues.map((i) => ({ ...i, groupIndex: g.index })));
    g.transactions.forEach((t: TransactionResult) => out.push(...t.issues.map((i) => ({ ...i, groupIndex: g.index, transactionIndex: t.index }))));
  });
  return out;
}

/**
 * "X12 JSON": a faithful, structure-preserving JSON view of one transaction
 * set wrapped with its envelope metadata (like the X12 <> JSON slide).
 */
export function transactionDocument(result: InterchangeResult, group: GroupResult, txn: TransactionResult) {
  const spec = getTransactionSpec(txn.type);
  return {
    type: { name: spec?.key ?? `${txn.type}_UNKNOWN`, description: spec?.name },
    stream: result.header?.usageIndicator === 'P' ? 'production' : 'test',
    sender: { isaQualifier: result.header?.senderQualifier, isaId: result.header?.senderId, applicationCode: group.senderCode },
    receiver: { isaQualifier: result.header?.receiverQualifier, isaId: result.header?.receiverId, applicationCode: group.receiverCode },
    interchange: { controlNumber: result.header?.controlNumber, date: result.header?.date, time: result.header?.time, version: result.header?.version },
    functionalGroup: { functionalIdentifierCode: group.functionalId, controlNumber: group.controlNumber, date: group.date, time: group.time, version: group.version },
    message: { transactionSets: [txn.tree ?? {}] },
  };
}
