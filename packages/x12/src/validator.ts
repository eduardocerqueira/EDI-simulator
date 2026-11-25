import { el, parseInterchange, X12ParseError } from './parser.js';
import { getSegmentSpec, SEGMENTS } from './specs/segments.js';
import { FUNCTIONAL_ID_BY_TRANSACTION, getTransactionSpec, segmentIdsOf } from './specs/transactions.js';
import type {
  Delimiters,
  ParsedGroup,
  ParsedInterchange,
  ParsedTransaction,
  Segment,
  SegmentElementSpec,
  StructureNode,
  TransactionSpec,
  X12Issue,
  X12JsonNode,
} from './types.js';

// ---------------------------------------------------------------------------
// Element level (AK4)
// ---------------------------------------------------------------------------

function isValidDate(v: string): boolean {
  let y: number, m: number, d: number;
  if (/^\d{6}$/.test(v)) {
    y = 2000 + Number(v.slice(0, 2));
    m = Number(v.slice(2, 4));
    d = Number(v.slice(4, 6));
  } else if (/^\d{8}$/.test(v)) {
    y = Number(v.slice(0, 4));
    m = Number(v.slice(4, 6));
    d = Number(v.slice(6, 8));
  } else return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidTime(v: string): boolean {
  if (!/^\d{4}(\d{2}(\d{1,2})?)?$/.test(v)) return false;
  const hh = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const ss = v.length >= 6 ? Number(v.slice(4, 6)) : 0;
  return hh < 24 && mm < 60 && ss < 60;
}

/** Length of a value as X12 counts it (sign and decimal point are not counted for numerics). */
function x12Length(spec: SegmentElementSpec, v: string): number {
  if (spec.type === 'R' || spec.type === 'N0' || spec.type === 'N2') return v.replace(/[-.]/g, '').length;
  return v.length;
}

export function validateElements(segment: Segment, segmentPosition: number, loopId?: string): X12Issue[] {
  const spec = getSegmentSpec(segment.id);
  if (!spec) return [];
  const issues: X12Issue[] = [];
  const base = { level: 'ELEMENT' as const, x12CodeSource: 'AK4' as const, severity: 'ERROR' as const, segmentId: segment.id, segmentPosition, loopId };
  const values = segment.elements.slice(1);

  if (values.length > spec.elements.length) {
    const extra = values.slice(spec.elements.length).some((v) => v !== '');
    if (extra) {
      issues.push({ ...base, code: 'TOO_MANY_ELEMENTS', x12Code: '3', elementPosition: spec.elements.length + 1, message: `${segment.id} has ${values.length} elements but only ${spec.elements.length} are defined` });
    }
  }

  spec.elements.forEach((e, i) => {
    const pos = i + 1;
    const name = `${segment.id}${String(pos).padStart(2, '0')}`;
    const raw = values[i] ?? '';
    const v = segment.id === 'ISA' ? raw : raw.trim();
    const common = { ...base, elementPosition: pos, elementRef: e.ref };
    // ISA is fixed-length: ISA02/ISA04 may legitimately be 10 spaces.
    const blank = segment.id === 'ISA' ? raw === '' || (raw.trim() === '' && !['I02', 'I04'].includes(e.ref)) : v === '';
    if (blank) {
      if (e.usage === 'M') {
        issues.push({ ...common, code: 'MANDATORY_ELEMENT_MISSING', x12Code: '1', message: `${name} (${e.name}) is mandatory but missing` });
      }
      return;
    }
    if (/[\x00-\x1F\x7F]/.test(v)) {
      issues.push({ ...common, code: 'INVALID_CHARACTER', x12Code: '6', badValue: v, message: `${name} (${e.name}) contains a control character` });
      return;
    }
    switch (e.type) {
      case 'N0':
      case 'N2':
        if (!/^-?\d+$/.test(v)) {
          issues.push({ ...common, code: 'INVALID_NUMERIC', x12Code: '6', badValue: v, message: `${name} (${e.name}) must be an integer, got "${v}"` });
          return;
        }
        break;
      case 'R':
        if (!/^-?(\d+\.?\d*|\.\d+)$/.test(v)) {
          issues.push({ ...common, code: 'INVALID_DECIMAL', x12Code: '6', badValue: v, message: `${name} (${e.name}) must be a decimal number, got "${v}"` });
          return;
        }
        break;
      case 'DT':
        if (!isValidDate(v) || v.length < e.min || v.length > e.max) {
          issues.push({ ...common, code: 'INVALID_DATE', x12Code: '8', badValue: v, message: `${name} (${e.name}) is not a valid ${e.max === 6 ? 'YYMMDD' : 'CCYYMMDD'} date: "${v}"` });
          return;
        }
        break;
      case 'TM':
        if (!isValidTime(v)) {
          issues.push({ ...common, code: 'INVALID_TIME', x12Code: '9', badValue: v, message: `${name} (${e.name}) is not a valid HHMM[SS] time: "${v}"` });
          return;
        }
        break;
    }
    const len = x12Length(e, v);
    if (len < e.min) {
      issues.push({ ...common, code: 'ELEMENT_TOO_SHORT', x12Code: '4', badValue: v, message: `${name} (${e.name}) is too short: ${len} < min ${e.min}` });
      return;
    }
    if (len > e.max) {
      issues.push({ ...common, code: 'ELEMENT_TOO_LONG', x12Code: '5', badValue: v, message: `${name} (${e.name}) is too long: ${len} > max ${e.max}` });
      return;
    }
    if (e.type === 'ID' && e.codes && !(v in e.codes)) {
      issues.push({ ...common, code: 'INVALID_CODE_VALUE', x12Code: '7', badValue: v, message: `${name} (${e.name}) has invalid code "${v}". Allowed: ${Object.keys(e.codes).join(', ')}` });
    }
  });
  return issues;
}

/** Convert a segment into a `{ elementKey: value }` object using the dictionary names. */
export function segmentToObject(segment: Segment): Record<string, unknown> {
  const spec = getSegmentSpec(segment.id);
  const obj: Record<string, unknown> = {};
  segment.elements.slice(1).forEach((raw, i) => {
    const value = segment.id === 'ISA' ? raw : raw.trim();
    if (value === '') return;
    const key = spec?.elements[i]?.key ?? `element${String(i + 1).padStart(2, '0')}`;
    obj[key] = value;
  });
  return obj;
}

// ---------------------------------------------------------------------------
// Segment / loop structure (AK3)
// ---------------------------------------------------------------------------

interface MatchCtx {
  segs: Segment[];
  idx: number;
  issues: X12Issue[];
  pos: (s: Segment) => number;
  endPosition: number;
}

function segIssue(ctx: MatchCtx, s: Segment | undefined, segmentId: string, code: string, x12Code: string, message: string, loopId?: string): X12Issue {
  return {
    level: 'SEGMENT', code, x12Code, x12CodeSource: 'AK3', severity: 'ERROR', segmentId,
    segmentPosition: s ? ctx.pos(s) : ctx.endPosition, loopId, message,
  };
}

function matchNodes(nodes: StructureNode[], ctx: MatchCtx, loopId: string | undefined, isLoopBody: boolean): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  nodes.forEach((node, nodeIndex) => {
    if (node.kind === 'segment') {
      const spec = SEGMENTS[node.id]!;
      const isTrigger = isLoopBody && nodeIndex === 0;
      let count = 0;
      while (ctx.idx < ctx.segs.length && ctx.segs[ctx.idx]!.id === node.id) {
        if (isTrigger && count === 1) break;
        const s = ctx.segs[ctx.idx]!;
        count++;
        if (count > node.max) {
          ctx.issues.push(segIssue(ctx, s, s.id, 'SEGMENT_EXCEEDS_MAX_USE', '5', `${s.id} appears ${count} times, maximum is ${node.max}`, loopId));
        }
        ctx.issues.push(...validateElements(s, ctx.pos(s), loopId));
        (out[spec.key] ??= []).push(segmentToObject(s));
        ctx.idx++;
      }
      if (count === 0 && node.usage === 'M') {
        const next = ctx.segs[ctx.idx];
        ctx.issues.push(segIssue(ctx, next, node.id, 'MANDATORY_SEGMENT_MISSING', '3', `Mandatory segment ${node.id} (${spec.name}) is missing`, loopId));
      }
    } else {
      const trigger = (node.children[0] as { id: string }).id;
      let count = 0;
      while (ctx.idx < ctx.segs.length && ctx.segs[ctx.idx]!.id === trigger) {
        count++;
        if (count === node.max + 1) {
          ctx.issues.push(segIssue(ctx, ctx.segs[ctx.idx], trigger, 'LOOP_EXCEEDS_MAX', '4', `Loop ${node.id} occurs more than ${node.max} times`, node.id));
        }
        (out[node.key] ??= []).push(matchNodes(node.children, ctx, node.id, true));
      }
      if (count === 0 && node.usage === 'M') {
        ctx.issues.push(segIssue(ctx, ctx.segs[ctx.idx], trigger, 'MANDATORY_SEGMENT_MISSING', '3', `Mandatory loop ${node.id} (${node.name}) is missing`, node.id));
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Implementation-guide rules (still syntax level, reported in the 997)
// ---------------------------------------------------------------------------

function guideRules(spec: TransactionSpec, body: Segment[], pos: (s: Segment) => number): X12Issue[] {
  const issues: X12Issue[] = [];
  const ctt = body.find((s) => s.id === 'CTT');
  const counted = spec.id === '856' ? 'HL' : 'LIN';
  if (ctt && ['832', '846', '856'].includes(spec.id)) {
    const actual = body.filter((s) => s.id === counted).length;
    const declared = el(ctt, 1);
    if (/^\d+$/.test(declared) && Number(declared) !== actual) {
      issues.push({
        level: 'ELEMENT', code: 'CTT_COUNT_MISMATCH', x12Code: '7', x12CodeSource: 'AK4', severity: 'ERROR',
        segmentId: 'CTT', segmentPosition: pos(ctt), elementPosition: 1, elementRef: '354', badValue: declared,
        message: `CTT01 declares ${declared} ${counted} segments but the transaction contains ${actual}`,
      });
    }
  }
  if (spec.id === '856') {
    const seen = new Map<string, string>();
    body.filter((s) => s.id === 'HL').forEach((hl, i) => {
      const id = el(hl, 1);
      const parent = el(hl, 2);
      const level = el(hl, 3);
      if (seen.has(id)) {
        issues.push({ level: 'ELEMENT', code: 'HL_DUPLICATE_ID', x12Code: '7', x12CodeSource: 'AK4', severity: 'ERROR', segmentId: 'HL', segmentPosition: pos(hl), elementPosition: 1, elementRef: '628', badValue: id, loopId: 'HL', message: `HL01 "${id}" is used more than once` });
      }
      if (i === 0 && level !== 'S') {
        issues.push({ level: 'ELEMENT', code: 'HL_FIRST_NOT_SHIPMENT', x12Code: '7', x12CodeSource: 'AK4', severity: 'ERROR', segmentId: 'HL', segmentPosition: pos(hl), elementPosition: 3, elementRef: '735', badValue: level, loopId: 'HL', message: 'The first HL must be the shipment level (HL03 = S)' });
      }
      if (parent && !seen.has(parent)) {
        issues.push({ level: 'ELEMENT', code: 'HL_INVALID_PARENT', x12Code: '7', x12CodeSource: 'AK4', severity: 'ERROR', segmentId: 'HL', segmentPosition: pos(hl), elementPosition: 2, elementRef: '734', badValue: parent, loopId: 'HL', message: `HL02 parent "${parent}" does not reference a previous HL01` });
      }
      seen.set(id, level);
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Transaction set (AK5)
// ---------------------------------------------------------------------------

export interface TransactionResult {
  index: number;
  type: string;
  typeName?: string;
  controlNumber: string;
  segmentCount: number;
  declaredSegmentCount?: string;
  startPosition: number;
  issues: X12Issue[];
  ackCode: 'A' | 'R';
  /** AK5 error codes (718). */
  ak5Codes: string[];
  tree?: X12JsonNode;
  raw: string;
  segments: Segment[];
}

export function validateTransaction(txn: ParsedTransaction, index: number, delimiters: Delimiters): TransactionResult {
  const issues: X12Issue[] = [];
  const type = el(txn.st, 1);
  const controlNumber = el(txn.st, 2);
  const startPos = txn.st.position;
  const pos = (s: Segment) => s.position - startPos + 1;
  const txIssue = (code: string, x12Code: string, message: string, extra: Partial<X12Issue> = {}): X12Issue => ({
    level: 'TRANSACTION', code, x12Code, x12CodeSource: 'AK5', severity: 'ERROR', message, ...extra,
  });
  const spec = getTransactionSpec(type);

  issues.push(...validateElements(txn.st, 1));
  if (!spec) {
    issues.push(txIssue('TRANSACTION_SET_NOT_SUPPORTED', '1', `Transaction set "${type}" is not supported by this receiver`, { segmentId: 'ST', segmentPosition: 1 }));
  }
  if (!controlNumber || controlNumber.length < 4 || controlNumber.length > 9) {
    issues.push(txIssue('INVALID_ST_CONTROL_NUMBER', '7', `ST02 control number "${controlNumber}" must be 4-9 characters`, { segmentId: 'ST', segmentPosition: 1 }));
  }
  if (!txn.se) {
    issues.push(txIssue('SE_MISSING', '2', 'Transaction set trailer (SE) is missing'));
  } else {
    issues.push(...validateElements(txn.se, pos(txn.se)));
    const declared = el(txn.se, 1);
    if (declared !== String(txn.segments.length)) {
      issues.push(txIssue('SE_SEGMENT_COUNT_MISMATCH', '4', `SE01 declares ${declared || '(empty)'} segments but ST..SE contains ${txn.segments.length}`, { segmentId: 'SE', segmentPosition: pos(txn.se), badValue: declared }));
    }
    if (el(txn.se, 2) !== controlNumber) {
      issues.push(txIssue('ST_SE_CONTROL_MISMATCH', '3', `SE02 "${el(txn.se, 2)}" does not match ST02 "${controlNumber}"`, { segmentId: 'SE', segmentPosition: pos(txn.se), badValue: el(txn.se, 2) }));
    }
  }

  let tree: X12JsonNode | undefined;
  if (spec) {
    const known = segmentIdsOf(spec.structure);
    const body: Segment[] = [];
    for (const s of txn.body) {
      if (known.has(s.id)) body.push(s);
      else if (SEGMENTS[s.id]) issues.push({ level: 'SEGMENT', code: 'SEGMENT_NOT_IN_TRANSACTION_SET', x12Code: '6', x12CodeSource: 'AK3', severity: 'ERROR', segmentId: s.id, segmentPosition: pos(s), message: `Segment ${s.id} is not defined for transaction set ${type}` });
      else issues.push({ level: 'SEGMENT', code: 'UNRECOGNIZED_SEGMENT', x12Code: '1', x12CodeSource: 'AK3', severity: 'ERROR', segmentId: s.id, segmentPosition: pos(s), message: `Unrecognized segment ID "${s.id}"` });
    }
    const ctx: MatchCtx = { segs: body, idx: 0, issues: [], pos, endPosition: txn.se ? pos(txn.se) : txn.segments.length + 1 };
    const bodyTree = matchNodes(spec.structure, ctx, undefined, false);
    for (let i = ctx.idx; i < body.length; i++) {
      const s = body[i]!;
      ctx.issues.push(segIssue(ctx, s, s.id, 'SEGMENT_OUT_OF_SEQUENCE', '7', `Segment ${s.id} is not in the proper sequence`));
    }
    issues.push(...ctx.issues, ...guideRules(spec, body, pos));
    tree = {
      transactionSetHeader: [segmentToObject(txn.st)],
      ...bodyTree,
      ...(txn.se ? { transactionSetTrailer: [segmentToObject(txn.se)] } : {}),
    };
  }

  const errors = issues.filter((i) => i.severity === 'ERROR');
  const ak5Codes = [...new Set(errors.map((i) => (i.x12CodeSource === 'AK5' ? i.x12Code! : '5')))].slice(0, 5);
  return {
    index,
    type,
    typeName: spec?.name,
    controlNumber,
    segmentCount: txn.segments.length,
    declaredSegmentCount: txn.se ? el(txn.se, 1) : undefined,
    startPosition: startPos,
    issues,
    ackCode: errors.length ? 'R' : 'A',
    ak5Codes: errors.length ? ak5Codes : [],
    tree,
    raw: txn.segments.map((s) => s.raw).join('\n'),
    segments: txn.segments,
  };
}

// ---------------------------------------------------------------------------
// Functional group (AK9)
// ---------------------------------------------------------------------------

export interface GroupResult {
  index: number;
  functionalId: string;
  senderCode: string;
  receiverCode: string;
  date: string;
  time: string;
  controlNumber: string;
  version: string;
  declaredTransactionCount?: string;
  issues: X12Issue[];
  ackCode: 'A' | 'P' | 'R';
  ak9Codes: string[];
  acceptedCount: number;
  transactions: TransactionResult[];
}

const SUPPORTED_FUNCTIONAL_IDS = new Set(['SC', 'IB', 'SH', 'FA']);

export function validateGroup(group: ParsedGroup, index: number, delimiters: Delimiters): GroupResult {
  const issues: X12Issue[] = [];
  const g = group.gs;
  const functionalId = el(g, 1);
  const controlNumber = el(g, 6);
  const grpIssue = (code: string, x12Code: string, message: string, extra: Partial<X12Issue> = {}): X12Issue => ({
    level: 'GROUP', code, x12Code, x12CodeSource: 'AK9', severity: 'ERROR', message, segmentId: 'GS', segmentPosition: g.position, ...extra,
  });

  // GS element errors cannot be expressed in AK9; translators report them in TA1 (024).
  for (const e of validateElements(g, g.position)) {
    issues.push({ ...e, level: 'GROUP', x12CodeSource: 'AK9', x12Code: e.elementPosition === 6 ? '6' : undefined, message: `GS: ${e.message}` });
  }
  if (!SUPPORTED_FUNCTIONAL_IDS.has(functionalId)) issues.push(grpIssue('FUNCTIONAL_GROUP_NOT_SUPPORTED', '1', `Functional identifier "${functionalId}" is not supported`, { badValue: functionalId }));
  if (el(g, 8) !== '004010') issues.push(grpIssue('GROUP_VERSION_NOT_SUPPORTED', '2', `Version "${el(g, 8)}" is not supported (expected 004010)`, { badValue: el(g, 8) }));
  if (!group.ge) {
    issues.push(grpIssue('GE_MISSING', '3', 'Functional group trailer (GE) is missing'));
  } else {
    if (el(group.ge, 2) !== controlNumber) issues.push(grpIssue('GS_GE_CONTROL_MISMATCH', '4', `GE02 "${el(group.ge, 2)}" does not match GS06 "${controlNumber}"`, { segmentId: 'GE', segmentPosition: group.ge.position, badValue: el(group.ge, 2) }));
    if (el(group.ge, 1) !== String(group.transactions.length)) issues.push(grpIssue('GE_TRANSACTION_COUNT_MISMATCH', '5', `GE01 declares ${el(group.ge, 1)} transaction sets but the group contains ${group.transactions.length}`, { segmentId: 'GE', segmentPosition: group.ge.position, badValue: el(group.ge, 1) }));
  }

  const seen = new Set<string>();
  const transactions = group.transactions.map((t, i) => {
    const r = validateTransaction(t, i, delimiters);
    const expectedFid = FUNCTIONAL_ID_BY_TRANSACTION[r.type];
    if (expectedFid && expectedFid !== functionalId) {
      r.issues.push({ level: 'TRANSACTION', code: 'TRANSACTION_NOT_IN_FUNCTIONAL_GROUP', x12Code: '6', x12CodeSource: 'AK5', severity: 'ERROR', segmentId: 'ST', segmentPosition: 1, badValue: r.type, message: `Transaction set ${r.type} belongs to functional group ${expectedFid}, but GS01 is ${functionalId}` });
    }
    if (seen.has(r.controlNumber)) {
      r.issues.push({ level: 'TRANSACTION', code: 'DUPLICATE_ST_CONTROL_NUMBER', x12Code: '23', x12CodeSource: 'AK5', severity: 'ERROR', segmentId: 'ST', segmentPosition: 1, badValue: r.controlNumber, message: `ST02 "${r.controlNumber}" is not unique within the functional group` });
    }
    seen.add(r.controlNumber);
    if (r.issues.some((x) => x.severity === 'ERROR')) {
      r.ackCode = 'R';
      r.ak5Codes = [...new Set(r.issues.filter((x) => x.severity === 'ERROR').map((x) => (x.x12CodeSource === 'AK5' ? x.x12Code! : '5')))].slice(0, 5);
    }
    return r;
  });

  const groupErrors = issues.filter((i) => i.severity === 'ERROR');
  const acceptedCount = groupErrors.length ? 0 : transactions.filter((t) => t.ackCode === 'A').length;
  let ackCode: 'A' | 'P' | 'R' = 'R';
  if (!groupErrors.length && transactions.length) {
    ackCode = acceptedCount === transactions.length ? 'A' : acceptedCount === 0 ? 'R' : 'P';
  }
  return {
    index,
    functionalId,
    senderCode: el(g, 2),
    receiverCode: el(g, 3),
    date: el(g, 4),
    time: el(g, 5),
    controlNumber,
    version: el(g, 8),
    declaredTransactionCount: group.ge ? el(group.ge, 1) : undefined,
    issues,
    ackCode,
    ak9Codes: [...new Set(groupErrors.map((i) => i.x12Code).filter((c): c is string => !!c))].slice(0, 5),
    acceptedCount,
    transactions,
  };
}

// ---------------------------------------------------------------------------
// Interchange (TA1)
// ---------------------------------------------------------------------------

export interface InterchangeHeader {
  authorizationQualifier: string;
  securityQualifier: string;
  senderQualifier: string;
  senderId: string;
  receiverQualifier: string;
  receiverId: string;
  date: string;
  time: string;
  standardsId: string;
  version: string;
  controlNumber: string;
  ackRequested: string;
  usageIndicator: string;
  componentSeparator: string;
}

export interface InterchangeContext {
  /** ISA08 values this receiver accepts (trimmed). */
  receiverIds?: string[];
  /** ISA06 values of registered trading partners (trimmed). */
  knownSenderIds?: string[];
  /** Return true if the (sender, ICN) pair was already received. */
  isDuplicate?: (senderId: string, controlNumber: string) => boolean;
}

export interface InterchangeResult {
  ok: boolean;
  parseError?: { message: string; ta1Code: string; code: string };
  delimiters?: Delimiters;
  header?: InterchangeHeader;
  declaredGroupCount?: string;
  trailerControlNumber?: string;
  isaLength?: number;
  issues: X12Issue[];
  ta1: { ackCode: 'A' | 'E' | 'R'; noteCode: string };
  groups: GroupResult[];
  parsed?: ParsedInterchange;
}

const ISA_TA1_CODES: Record<number, string> = {
  1: '010', 3: '012', 5: '005', 6: '006', 7: '007', 8: '008', 9: '014', 10: '015', 11: '016', 12: '017', 13: '018', 14: '019', 15: '020', 16: '027',
};

export function headerOf(isa: Segment): InterchangeHeader {
  return {
    authorizationQualifier: el(isa, 1),
    securityQualifier: el(isa, 3),
    senderQualifier: el(isa, 5),
    senderId: el(isa, 6),
    receiverQualifier: el(isa, 7),
    receiverId: el(isa, 8),
    date: el(isa, 9),
    time: el(isa, 10),
    standardsId: el(isa, 11),
    version: el(isa, 12),
    controlNumber: el(isa, 13),
    ackRequested: el(isa, 14),
    usageIndicator: el(isa, 15),
    componentSeparator: isa.elements[16] ?? '',
  };
}

/**
 * Full receive-side validation of one interchange: envelope (TA1), every
 * functional group (AK9), every transaction set (AK5) down to segments (AK3)
 * and elements (AK4).
 */
export function analyzeInterchange(raw: string, ctx: InterchangeContext = {}): InterchangeResult {
  let parsed: ParsedInterchange;
  try {
    parsed = parseInterchange(raw);
  } catch (e) {
    if (e instanceof X12ParseError) {
      return {
        ok: false,
        parseError: { message: e.message, ta1Code: e.ta1Code, code: e.code },
        issues: [{ level: 'INTERCHANGE', code: e.code, x12Code: e.ta1Code, x12CodeSource: 'TA1', severity: 'ERROR', message: e.message }],
        ta1: { ackCode: 'R', noteCode: e.ta1Code },
        groups: [],
      };
    }
    throw e;
  }

  const { isa, iea, delimiters } = parsed;
  const issues: X12Issue[] = parsed.structureIssues.filter((i) => i.level === 'INTERCHANGE');
  const header = headerOf(isa);
  const ic = (code: string, x12Code: string, message: string, extra: Partial<X12Issue> = {}): X12Issue => ({
    level: 'INTERCHANGE', code, x12Code, x12CodeSource: 'TA1', severity: 'ERROR', message, segmentId: 'ISA', segmentPosition: 1, ...extra,
  });

  if (parsed.isaLength !== 106) {
    issues.push(ic('ISA_INVALID_LENGTH', '022', `ISA segment must be exactly 106 characters (fixed length) but is ${parsed.isaLength}. Check the padding of ISA02/04/06/08.`));
  }
  if (isa.elements.length !== 17) {
    issues.push(ic('ISA_ELEMENT_COUNT', '022', `ISA must have exactly 16 elements, found ${isa.elements.length - 1}`));
  }
  for (const e of validateElements(isa, 1)) {
    issues.push({ ...e, level: 'INTERCHANGE', x12CodeSource: 'TA1', x12Code: ISA_TA1_CODES[e.elementPosition ?? 0] ?? '022' });
  }
  const comp = header.componentSeparator;
  if (comp === delimiters.element || comp === delimiters.segment) {
    issues.push(ic('INVALID_COMPONENT_SEPARATOR', '027', `ISA16 component separator "${comp}" collides with another delimiter`));
  }
  if (ctx.receiverIds && !ctx.receiverIds.includes(header.receiverId)) {
    issues.push(ic('UNKNOWN_RECEIVER', '009', `ISA08 receiver "${header.receiverId}" is not this receiver (${ctx.receiverIds.join(', ')})`, { elementPosition: 8, badValue: header.receiverId }));
  }
  if (ctx.knownSenderIds && !ctx.knownSenderIds.includes(header.senderId)) {
    issues.push(ic('UNKNOWN_SENDER', '006', `ISA06 sender "${header.senderId}" is not a registered trading partner`, { elementPosition: 6, badValue: header.senderId }));
  }
  if (ctx.isDuplicate?.(header.senderId, header.controlNumber)) {
    issues.push(ic('DUPLICATE_INTERCHANGE', '025', `Interchange control number ${header.controlNumber} was already received from ${header.senderId}`, { elementPosition: 13, badValue: header.controlNumber }));
  }
  if (iea) {
    for (const e of validateElements(iea, iea.position)) issues.push({ ...e, level: 'INTERCHANGE', x12CodeSource: 'TA1', x12Code: '022' });
    if (el(iea, 2) !== header.controlNumber) {
      issues.push(ic('ISA_IEA_CONTROL_MISMATCH', '001', `IEA02 "${el(iea, 2)}" does not match ISA13 "${header.controlNumber}"`, { segmentId: 'IEA', segmentPosition: iea.position, badValue: el(iea, 2) }));
    }
    if (el(iea, 1) !== String(parsed.groups.length)) {
      issues.push(ic('IEA_GROUP_COUNT_MISMATCH', '021', `IEA01 declares ${el(iea, 1)} functional groups but the interchange contains ${parsed.groups.length}`, { segmentId: 'IEA', segmentPosition: iea.position, badValue: el(iea, 1) }));
    }
  }
  if (parsed.groups.length === 0) issues.push(ic('NO_FUNCTIONAL_GROUPS', '024', 'Interchange contains no functional groups'));

  const groups = parsed.groups.map((g, i) => validateGroup(g, i, delimiters));
  const errors = issues.filter((i) => i.severity === 'ERROR');
  return {
    ok: errors.length === 0,
    delimiters,
    header,
    declaredGroupCount: iea ? el(iea, 1) : undefined,
    trailerControlNumber: iea ? el(iea, 2) : undefined,
    isaLength: parsed.isaLength,
    issues,
    ta1: errors.length ? { ackCode: 'R', noteCode: errors[0]!.x12Code ?? '022' } : { ackCode: 'A', noteCode: '000' },
    groups,
    parsed,
  };
}
