import { PRODUCTS, upcCheckDigit, type Producer } from '@edi/shared';
import type { InterchangeModel, SegmentArray } from '@edi/x12';
import { pick } from './random.js';

/**
 * Bad-data scenarios. Each one starts from a *valid* interchange model and
 * breaks exactly one rule, so you can see how the receiver detects it and
 * which acknowledgment code (TA1 / 997 AK9 / AK5 / AK3 / AK4) it produces.
 */
export interface Scenario {
  id: string;
  layer: 'interchange' | 'group' | 'transaction' | 'segment' | 'element' | 'business';
  expected: string;
  description: string;
  /** Mutate the model. */
  apply?: (m: InterchangeModel, ctx: ScenarioContext) => void;
  /** Mutate the serialized text (for problems a model cannot express). */
  applyText?: (x12: string, ctx: ScenarioContext) => string;
  /** Only valid for these transaction types. */
  types?: string[];
}

export interface ScenarioContext {
  producer: Producer;
  type: string;
  /** A control number already used by this producer (for duplicate tests). */
  previousControlNumber?: string;
}

const txn = (m: InterchangeModel) => m.groups[0]!.transactions[0]!.segments;
const findSeg = (segs: SegmentArray[], id: string) => segs.find((s) => s[0] === id);
const findAll = (segs: SegmentArray[], id: string) => segs.filter((s) => s[0] === id);

export const SCENARIOS: Scenario[] = [
  // ---- Interchange envelope (TA1 rejects the whole file) ----
  {
    id: 'ISA_IEA_CONTROL_MISMATCH', layer: 'interchange', expected: 'TA1 R / 001',
    description: 'IEA02 does not match ISA13 interchange control number.',
    apply: (m) => { m.iea[2] = String(Number(m.iea[2]) + 1).padStart(9, '0'); },
  },
  {
    id: 'ISA_BAD_PADDING', layer: 'interchange', expected: 'TA1 R / 022',
    description: 'ISA06 sender ID not padded to 15 chars, so ISA is not 106 characters.',
    apply: (m) => { m.isa[6] = m.isa[6]!.trim(); },
  },
  {
    id: 'UNKNOWN_SENDER', layer: 'interchange', expected: 'TA1 R / 006',
    description: 'ISA06 is not a registered trading partner.',
    apply: (m) => { m.isa[6] = 'ROGUEFARM'.padEnd(15, ' '); },
  },
  {
    id: 'WRONG_RECEIVER', layer: 'interchange', expected: 'TA1 R / 009',
    description: 'ISA08 addressed to someone other than the distributor.',
    apply: (m) => { m.isa[8] = 'OTHERDIST'.padEnd(15, ' '); },
  },
  {
    id: 'IEA_GROUP_COUNT', layer: 'interchange', expected: 'TA1 R / 021',
    description: 'IEA01 declares the wrong number of functional groups.',
    apply: (m) => { m.iea[1] = '3'; },
  },
  {
    id: 'INVALID_ISA_DATE', layer: 'interchange', expected: 'TA1 R / 014',
    description: 'ISA09 is not a valid YYMMDD date.',
    apply: (m) => { m.isa[9] = '261345'; },
  },
  {
    id: 'DUPLICATE_INTERCHANGE', layer: 'interchange', expected: 'TA1 R / 025',
    description: 'Re-sends an interchange control number the distributor already processed.',
    apply: (m, ctx) => {
      if (!ctx.previousControlNumber) return;
      m.isa[13] = ctx.previousControlNumber;
      m.iea[2] = ctx.previousControlNumber;
    },
  },
  {
    id: 'MISSING_IEA', layer: 'interchange', expected: 'TA1 R / 023',
    description: 'File truncated: the IEA trailer is missing (premature end of file).',
    applyText: (x12) => x12.replace(/IEA\*[^~]*~\s*$/, ''),
  },

  // ---- Functional group (997 AK9) ----
  {
    id: 'GS_GE_CONTROL_MISMATCH', layer: 'group', expected: '997 AK9 R / 4',
    description: 'GE02 does not match GS06 group control number.',
    apply: (m) => { m.groups[0]!.ge[2] = String(Number(m.groups[0]!.ge[2]) + 7); },
  },
  {
    id: 'GE_TRANSACTION_COUNT', layer: 'group', expected: '997 AK9 R / 5',
    description: 'GE01 declares the wrong number of transaction sets.',
    apply: (m) => { m.groups[0]!.ge[1] = '5'; },
  },
  {
    id: 'WRONG_FUNCTIONAL_ID', layer: 'group', expected: '997 AK5 R / 6',
    description: 'GS01 functional identifier does not match the transaction set type.',
    apply: (m, ctx) => { m.groups[0]!.gs[1] = ctx.type === '832' ? 'IB' : 'SC'; },
  },
  {
    id: 'UNSUPPORTED_VERSION', layer: 'group', expected: '997 AK9 R / 2',
    description: 'GS08 version 005010 is not supported by this receiver.',
    apply: (m) => { m.groups[0]!.gs[8] = '005010'; },
  },

  // ---- Transaction set (997 AK5) ----
  {
    id: 'SE_SEGMENT_COUNT', layer: 'transaction', expected: '997 AK5 R / 4',
    description: 'SE01 declares the wrong number of included segments.',
    apply: (m) => { const se = txn(m).at(-1)!; se[1] = String(Number(se[1]) + 3); },
  },
  {
    id: 'ST_SE_CONTROL_MISMATCH', layer: 'transaction', expected: '997 AK5 R / 3',
    description: 'SE02 does not match ST02.',
    apply: (m) => { txn(m).at(-1)![2] = '9999'; },
  },
  {
    id: 'MISSING_SE', layer: 'transaction', expected: '997 AK5 R / 2',
    description: 'The SE trailer was dropped.',
    apply: (m) => { txn(m).pop(); },
  },

  // ---- Segment (997 AK3) ----
  {
    id: 'MISSING_BEGINNING_SEGMENT', layer: 'segment', expected: '997 AK3 / 3',
    description: 'Mandatory beginning segment (BCT / BIA / BSN) is missing.',
    apply: (m) => { const s = txn(m); s.splice(1, 1); s.at(-1)![1] = String(s.length); },
  },
  {
    id: 'UNKNOWN_SEGMENT', layer: 'segment', expected: '997 AK3 / 1',
    description: 'An unrecognized segment ID is inserted in the body.',
    apply: (m) => { const s = txn(m); s.splice(2, 0, ['ZZZ', 'FOO', 'BAR']); s.at(-1)![1] = String(s.length); },
  },
  {
    id: 'MISSING_CTT', layer: 'segment', expected: '997 AK3 / 3',
    description: 'The CTT totals segment is missing.',
    apply: (m) => { const s = txn(m); const i = s.findIndex((x) => x[0] === 'CTT'); if (i > 0) s.splice(i, 1); s.at(-1)![1] = String(s.length); },
  },

  // ---- Element (997 AK4) ----
  {
    id: 'INVALID_QUALIFIER', layer: 'element', expected: '997 AK4 / 7',
    description: 'LIN02 product ID qualifier "XX" is not a valid code.',
    apply: (m) => { const l = findSeg(txn(m), 'LIN'); if (l) l[2] = 'XX'; },
  },
  {
    id: 'INVALID_DATE', layer: 'element', expected: '997 AK4 / 8',
    description: 'A DTM date is not a real calendar date.',
    apply: (m) => {
      const s = txn(m);
      const d = findSeg(s, 'DTM');
      if (d) d[2] = '20261345';
      else { const b = s[1]!; if (b[0] === 'BIA') b[4] = '20261345'; else if (b[0] === 'BSN') b[3] = '20261345'; }
    },
  },
  {
    id: 'NON_NUMERIC_QUANTITY', layer: 'element', expected: '997 AK4 / 6',
    description: 'A quantity (QTY02 / SN102) or price (CTP03) contains letters.',
    apply: (m) => {
      const s = txn(m);
      const q = findSeg(s, 'QTY') ?? findSeg(s, 'SN1');
      if (q) q[2] = 'TWELVE';
      else { const c = findSeg(s, 'CTP'); if (c) c[3] = '1O.5O'; }
    },
  },
  {
    id: 'MISSING_REQUIRED_ELEMENT', layer: 'element', expected: '997 AK4 / 1',
    description: 'LIN03 (the product ID) is empty.',
    apply: (m) => { const l = findSeg(txn(m), 'LIN'); if (l) l[3] = ''; },
  },
  {
    id: 'ELEMENT_TOO_LONG', layer: 'element', expected: '997 AK4 / 5',
    description: 'N102 name exceeds 60 characters.',
    apply: (m) => { const n = findSeg(txn(m), 'N1'); if (n) n[2] = `${n[2]} ORGANIC REGENERATIVE COOPERATIVE AGRICULTURAL HOLDINGS INCORPORATED`; },
  },
  {
    id: 'CTT_COUNT_MISMATCH', layer: 'element', expected: '997 AK4 / 7',
    description: 'CTT01 hash count does not match the number of LIN / HL segments.',
    apply: (m) => { const c = findSeg(txn(m), 'CTT'); if (c) c[1] = String(Number(c[1]) + 2); },
  },
  {
    id: 'HL_INVALID_PARENT', layer: 'element', expected: '997 AK4 / 7',
    description: '856 HL02 points to a parent HL that does not exist.',
    types: ['856'],
    apply: (m) => { const hls = findAll(txn(m), 'HL'); const last = hls.at(-1); if (last) last[2] = '99'; },
  },

  // ---- Business (997 accepts, distributor rejects) ----
  {
    id: 'UNKNOWN_PRODUCT', layer: 'business', expected: '997 A, business rejected',
    description: 'Syntactically valid, but references a UPC that is not in the catalog.',
    types: ['846', '856'],
    apply: (m) => { const l = findSeg(txn(m), 'LIN'); if (l) { l[l.indexOf('UP') + 1] = `09999999999${upcCheckDigit('09999999999')}`; } },
  },
  {
    id: 'FOREIGN_PRODUCT', layer: 'business', expected: '997 A, business rejected',
    description: 'Producer sends a product that belongs to another producer.',
    types: ['846', '856'],
    apply: (m, ctx) => {
      const other = pick(PRODUCTS.filter((p) => p.producerCode !== ctx.producer.code));
      const l = findSeg(txn(m), 'LIN');
      if (l) { l[l.indexOf('UP') + 1] = other.upc; l[l.indexOf('VN') + 1] = other.sku; }
    },
  },
  {
    id: 'NEGATIVE_PRICE', layer: 'business', expected: '997 A, business rejected',
    description: 'Catalog price is zero or negative.',
    types: ['832'],
    apply: (m) => { const c = findSeg(txn(m), 'CTP'); if (c) c[3] = '-1.00'; },
  },
  {
    id: 'NEGATIVE_QUANTITY', layer: 'business', expected: '997 A, business rejected',
    description: 'Inventory advice with a negative available quantity.',
    types: ['846'],
    apply: (m) => { const q = findSeg(txn(m), 'QTY'); if (q) q[2] = '-25'; },
  },
];

export function scenariosFor(type: string): Scenario[] {
  return SCENARIOS.filter((s) => !s.types || s.types.includes(type));
}
