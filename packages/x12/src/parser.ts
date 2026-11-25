import type { Delimiters, ParsedGroup, ParsedInterchange, ParsedTransaction, Segment, X12Issue } from './types.js';

export class X12ParseError extends Error {
  constructor(
    message: string,
    /** TA1 interchange note code best describing the failure. */
    public readonly ta1Code: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'X12ParseError';
  }
}

/**
 * Detect delimiters from the ISA segment.
 *
 * ISA is fixed-length: character 4 is the element separator, character 105 is
 * the component separator (ISA16) and character 106 is the segment terminator.
 * If the ISA was not padded correctly we fall back to counting separators so we
 * can still report *why* it is wrong.
 */
export function detectDelimiters(raw: string): { delimiters: Delimiters; isaLength: number } {
  const text = raw.replace(/^﻿/, '').trimStart();
  if (!text.startsWith('ISA')) {
    throw new X12ParseError('Interchange does not start with an ISA segment', '022', 'MISSING_ISA');
  }
  const element = text[3];
  if (!element || /[A-Za-z0-9 ]/.test(element)) {
    throw new X12ParseError(`Invalid data element separator "${element ?? ''}"`, '026', 'INVALID_ELEMENT_SEPARATOR');
  }
  // Walk 16 separators to find ISA16 (robust to bad padding).
  let idx = 3;
  for (let i = 0; i < 15; i++) {
    idx = text.indexOf(element, idx + 1);
    if (idx < 0) throw new X12ParseError('ISA segment is truncated (fewer than 16 elements)', '023', 'ISA_TRUNCATED');
  }
  const component = text[idx + 1];
  const segment = text[idx + 2];
  if (!component || !segment) {
    throw new X12ParseError('ISA segment is truncated (missing ISA16 / segment terminator)', '023', 'ISA_TRUNCATED');
  }
  if (/[A-Za-z0-9]/.test(segment)) {
    throw new X12ParseError(`Invalid segment terminator "${segment}"`, '004', 'INVALID_SEGMENT_TERMINATOR');
  }
  return { delimiters: { element, component, segment }, isaLength: idx + 3 };
}

/** Split raw X12 text into segments. Line breaks after terminators are ignored. */
export function tokenize(raw: string, delimiters: Delimiters): Segment[] {
  const text = raw.replace(/^﻿/, '').trimStart();
  const parts = text.split(delimiters.segment);
  const segments: Segment[] = [];
  for (const part of parts) {
    const cleaned = part.replace(/^[\r\n]+|[\r\n]+$/g, '');
    if (!cleaned.trim()) continue;
    const elements = cleaned.split(delimiters.element);
    segments.push({ id: elements[0]!.trim(), elements, position: segments.length + 1, raw: cleaned + delimiters.segment });
  }
  return segments;
}

function issue(partial: Omit<X12Issue, 'severity'> & { severity?: X12Issue['severity'] }): X12Issue {
  return { severity: 'ERROR', ...partial };
}

/**
 * Parse an interchange into its envelope tree:
 *   ISA ── GS ── ST … SE ── GE ── IEA
 * Problems with the *structure* (missing trailers, segments outside an
 * envelope) are collected in `structureIssues` rather than thrown, so the
 * receiver can still acknowledge what it could read.
 */
export function parseInterchange(raw: string): ParsedInterchange {
  const { delimiters, isaLength } = detectDelimiters(raw);
  const segments = tokenize(raw, delimiters);
  const structureIssues: X12Issue[] = [];
  const isa = segments[0]!;
  let iea: Segment | undefined;
  const groups: ParsedGroup[] = [];
  let group: ParsedGroup | undefined;
  let txn: ParsedTransaction | undefined;

  // Missing SE / GE trailers are reported by the validator (AK5 2 / AK9 3),
  // here we only close the open envelopes.
  const closeTxn = () => {
    txn = undefined;
  };
  const closeGroup = () => {
    closeTxn();
    group = undefined;
  };

  for (let i = 1; i < segments.length; i++) {
    const s = segments[i]!;
    switch (s.id) {
      case 'ISA':
        structureIssues.push(issue({ level: 'INTERCHANGE', code: 'NESTED_ISA', x12Code: '022', x12CodeSource: 'TA1', message: 'Unexpected ISA inside an interchange', segmentId: 'ISA', segmentPosition: s.position }));
        break;
      case 'GS':
        if (group) closeGroup();
        group = { gs: s, transactions: [] };
        groups.push(group);
        break;
      case 'ST':
        if (!group) {
          structureIssues.push(issue({ level: 'INTERCHANGE', code: 'ST_OUTSIDE_GROUP', x12Code: '024', x12CodeSource: 'TA1', message: 'ST segment found outside of a GS/GE functional group', segmentId: 'ST', segmentPosition: s.position }));
          break;
        }
        if (txn) closeTxn();
        txn = { st: s, body: [], segments: [s] };
        group.transactions.push(txn);
        break;
      case 'SE':
        if (!txn) {
          structureIssues.push(issue({ level: 'GROUP', code: 'SE_WITHOUT_ST', x12Code: '024', x12CodeSource: 'TA1', message: 'SE segment without a matching ST', segmentId: 'SE', segmentPosition: s.position }));
          break;
        }
        txn.se = s;
        txn.segments.push(s);
        txn = undefined;
        break;
      case 'GE':
        if (!group) {
          structureIssues.push(issue({ level: 'INTERCHANGE', code: 'GE_WITHOUT_GS', x12Code: '024', x12CodeSource: 'TA1', message: 'GE segment without a matching GS', segmentId: 'GE', segmentPosition: s.position }));
          break;
        }
        closeTxn();
        group.ge = s;
        group = undefined;
        break;
      case 'IEA':
        closeGroup();
        iea = s;
        break;
      default:
        if (txn) {
          txn.body.push(s);
          txn.segments.push(s);
        } else {
          structureIssues.push(issue({ level: 'INTERCHANGE', code: 'SEGMENT_OUTSIDE_TRANSACTION', x12Code: '022', x12CodeSource: 'TA1', message: `Segment ${s.id} appears outside of an ST/SE transaction set`, segmentId: s.id, segmentPosition: s.position }));
        }
    }
    if (iea && i < segments.length - 1) {
      structureIssues.push(issue({ level: 'INTERCHANGE', code: 'DATA_AFTER_IEA', x12Code: '022', x12CodeSource: 'TA1', message: 'Data found after the IEA trailer', segmentPosition: segments[i + 1]!.position }));
      break;
    }
  }
  if (!iea) {
    closeGroup();
    structureIssues.push(issue({ level: 'INTERCHANGE', code: 'IEA_MISSING', x12Code: '023', x12CodeSource: 'TA1', message: 'Interchange has no IEA trailer (premature end of file)' }));
  }

  return { delimiters, isa, iea, groups, segments, isaLength, structureIssues };
}

/** Convenience accessor: element value by 1-based index, trimmed. */
export function el(segment: Segment | undefined, index: number): string {
  return (segment?.elements[index] ?? '').trim();
}
