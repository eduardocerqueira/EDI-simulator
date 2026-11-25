import { buildInterchangeModel, formatDate, formatTime, buildIsa, serializeInterchange, serializeSegment, type PartyId, type SegmentArray } from './builder.js';
import type { GroupResult, InterchangeResult } from './validator.js';

/**
 * Build the body (AK1..AK9) of a 997 Functional Acknowledgment for one
 * functional group. Syntax errors are reported as:
 *   AK2 (which ST) → AK3 (which segment) → AK4 (which element) → AK5 (verdict)
 */
export function build997Body(group: GroupResult): SegmentArray[] {
  const body: SegmentArray[] = [['AK1', group.functionalId || '??', group.controlNumber || '0']];
  for (const t of group.transactions) {
    body.push(['AK2', t.type || '???', t.controlNumber || '0000']);
    // group segment + element issues by segment position
    const bySegment = new Map<number, { id: string; loopId?: string; code?: string; elements: typeof t.issues }>();
    for (const i of t.issues) {
      if (i.level !== 'SEGMENT' && i.level !== 'ELEMENT') continue;
      const pos = i.segmentPosition ?? 0;
      const entry = bySegment.get(pos) ?? { id: i.segmentId ?? '??', loopId: i.loopId, elements: [] };
      if (i.level === 'SEGMENT') entry.code = i.x12Code;
      else entry.elements.push(i);
      bySegment.set(pos, entry);
    }
    for (const [pos, s] of [...bySegment.entries()].sort((a, b) => a[0] - b[0])) {
      body.push(['AK3', s.id, String(pos), s.loopId ?? '', s.code ?? (s.elements.length ? '8' : '')]);
      for (const e of s.elements.slice(0, 99)) {
        body.push(['AK4', String(e.elementPosition ?? 0), /^\d+$/.test(e.elementRef ?? '') ? e.elementRef! : '', e.x12Code ?? '7', (e.badValue ?? '').replace(/[*~>^|:\r\n]/g, ' ').slice(0, 99)]);
      }
    }
    body.push(['AK5', t.ackCode, ...t.ak5Codes]);
  }
  body.push(['AK9', group.ackCode, String(group.transactions.length), String(group.transactions.length), String(group.acceptedCount), ...group.ak9Codes.slice(0, 1)]);
  return body;
}

export interface OutboundAckOptions {
  /** The acknowledging party (receiver of the original interchange). */
  sender: PartyId;
  /** The original sender. */
  receiver: PartyId;
  interchangeControlNumber: number;
  groupControlNumberStart: number;
  date?: Date;
  usage?: 'T' | 'P';
}

/** A full interchange carrying one 997 per received functional group. */
export function build997Interchange(result: InterchangeResult, opts: OutboundAckOptions): string {
  const model = buildInterchangeModel({
    sender: opts.sender,
    receiver: opts.receiver,
    controlNumber: opts.interchangeControlNumber,
    date: opts.date,
    usage: opts.usage,
    ackRequested: '0',
    groups: result.groups.map((g, i) => ({
      functionalId: 'FA',
      senderCode: opts.sender.id,
      receiverCode: opts.receiver.id,
      controlNumber: opts.groupControlNumberStart + i,
      transactions: [{ type: '997', controlNumber: String(i + 1).padStart(4, '0'), body: build997Body(g) }],
    })),
  });
  return serializeInterchange(model);
}

/**
 * TA1 Interchange Acknowledgment: a single segment between ISA and IEA (no GS/GE).
 * TA101 = original ISA13, TA104 = A/E/R, TA105 = note code.
 */
export function buildTA1Interchange(result: InterchangeResult, opts: Omit<OutboundAckOptions, 'groupControlNumberStart'>): string {
  const d = opts.date ?? new Date();
  const h = result.header;
  const isa = buildIsa({ sender: opts.sender, receiver: opts.receiver, controlNumber: opts.interchangeControlNumber, date: d, usage: opts.usage, ackRequested: '0' });
  const ta1: SegmentArray = ['TA1', h?.controlNumber || '000000000', h?.date || formatDate(d, 6), h?.time || formatTime(d), result.ta1.ackCode, result.ta1.noteCode];
  const iea: SegmentArray = ['IEA', '0', String(opts.interchangeControlNumber).padStart(9, '0')];
  return [isa, ta1, iea].map((s) => serializeSegment(s)).join('\n') + '\n';
}
