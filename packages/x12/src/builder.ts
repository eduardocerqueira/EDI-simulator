import { DEFAULT_DELIMITERS, type Delimiters } from './types.js';

/** A segment as an array: `[id, e1, e2, ...]`. */
export type SegmentArray = string[];

export interface TransactionModel {
  /** All segments including ST and SE. */
  segments: SegmentArray[];
}

export interface GroupModel {
  gs: SegmentArray;
  transactions: TransactionModel[];
  ge: SegmentArray;
}

/**
 * A mutable in-memory interchange. The simulator builds a *valid* model first
 * and then corrupts specific parts of it to produce "bad data" scenarios.
 */
export interface InterchangeModel {
  isa: SegmentArray;
  groups: GroupModel[];
  iea: SegmentArray;
}

export interface PartyId {
  qualifier: string;
  id: string;
}

export interface InterchangeInput {
  sender: PartyId;
  receiver: PartyId;
  controlNumber: number;
  date?: Date;
  usage?: 'T' | 'P';
  ackRequested?: '0' | '1';
  componentSeparator?: string;
  groups: Array<{
    functionalId: string;
    senderCode: string;
    receiverCode: string;
    controlNumber: number;
    version?: string;
    transactions: Array<{ type: string; controlNumber: string; body: SegmentArray[] }>;
  }>;
}

const pad = (v: string, n: number) => v.slice(0, n).padEnd(n, ' ');
const pad0 = (v: number | string, n: number) => String(v).padStart(n, '0');

export function formatDate(d: Date, digits: 6 | 8): string {
  const y = d.getUTCFullYear();
  const s = `${y}${pad0(d.getUTCMonth() + 1, 2)}${pad0(d.getUTCDate(), 2)}`;
  return digits === 8 ? s : s.slice(2);
}

export function formatTime(d: Date): string {
  return `${pad0(d.getUTCHours(), 2)}${pad0(d.getUTCMinutes(), 2)}`;
}

export function formatIcn(n: number | string): string {
  return pad0(n, 9);
}

export function buildIsa(input: Pick<InterchangeInput, 'sender' | 'receiver' | 'controlNumber' | 'date' | 'usage' | 'ackRequested' | 'componentSeparator'>): SegmentArray {
  const d = input.date ?? new Date();
  return [
    'ISA', '00', pad('', 10), '00', pad('', 10),
    input.sender.qualifier, pad(input.sender.id, 15),
    input.receiver.qualifier, pad(input.receiver.id, 15),
    formatDate(d, 6), formatTime(d), 'U', '00401', formatIcn(input.controlNumber),
    input.ackRequested ?? '1', input.usage ?? 'T', input.componentSeparator ?? DEFAULT_DELIMITERS.component,
  ];
}

/** Build a valid interchange model with all counts and control numbers consistent. */
export function buildInterchangeModel(input: InterchangeInput): InterchangeModel {
  const d = input.date ?? new Date();
  const groups: GroupModel[] = input.groups.map((g) => {
    const transactions: TransactionModel[] = g.transactions.map((t) => {
      const segments: SegmentArray[] = [['ST', t.type, t.controlNumber], ...t.body];
      segments.push(['SE', String(segments.length + 1), t.controlNumber]);
      return { segments };
    });
    return {
      gs: ['GS', g.functionalId, g.senderCode, g.receiverCode, formatDate(d, 8), formatTime(d), String(g.controlNumber), 'X', g.version ?? '004010'],
      transactions,
      ge: ['GE', String(transactions.length), String(g.controlNumber)],
    };
  });
  return {
    isa: buildIsa(input),
    groups,
    iea: ['IEA', String(groups.length), formatIcn(input.controlNumber)],
  };
}

/** Recompute SE/GE/IEA counts after editing a model (call before corrupting counts on purpose). */
export function recount(model: InterchangeModel): InterchangeModel {
  for (const g of model.groups) {
    for (const t of g.transactions) {
      const se = t.segments[t.segments.length - 1];
      if (se?.[0] === 'SE') se[1] = String(t.segments.length);
    }
    g.ge[1] = String(g.transactions.length);
  }
  model.iea[1] = String(model.groups.length);
  return model;
}

export function serializeSegment(seg: SegmentArray, delimiters: Delimiters = DEFAULT_DELIMITERS): string {
  const parts = [...seg];
  if (parts[0] !== 'ISA') {
    while (parts.length > 1 && (parts[parts.length - 1] ?? '') === '') parts.pop();
  }
  return parts.join(delimiters.element) + delimiters.segment;
}

export function serializeInterchange(model: InterchangeModel, opts: { delimiters?: Delimiters; newlines?: boolean } = {}): string {
  const delimiters = opts.delimiters ?? DEFAULT_DELIMITERS;
  const all: SegmentArray[] = [model.isa];
  for (const g of model.groups) {
    all.push(g.gs);
    for (const t of g.transactions) all.push(...t.segments);
    all.push(g.ge);
  }
  all.push(model.iea);
  const sep = opts.newlines === false ? '' : '\n';
  return all.map((s) => serializeSegment(s, delimiters)).join(sep) + (sep ? '\n' : '');
}
