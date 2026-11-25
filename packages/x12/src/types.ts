/**
 * Core X12 types.
 *
 * Numbering convention: `Segment.elements[0]` is the segment ID and
 * `elements[n]` is the n-th data element (so `ISA06` is `elements[6]`).
 * This mirrors how X12 implementation guides reference elements.
 */

export interface Delimiters {
  /** Separates data elements inside a segment (ISA position 4). Usually `*`. */
  element: string;
  /** Separates components inside a composite element (ISA16). Usually `>` or `:`. */
  component: string;
  /** Terminates each segment (the char right after ISA16). Usually `~`. */
  segment: string;
}

export const DEFAULT_DELIMITERS: Delimiters = { element: '*', component: '>', segment: '~' };

export interface Segment {
  id: string;
  elements: string[];
  /** 1-based position of the segment inside the whole interchange (ISA = 1). */
  position: number;
  raw: string;
}

export interface ParsedTransaction {
  st: Segment;
  se?: Segment;
  /** Segments strictly between ST and SE. */
  body: Segment[];
  /** ST..SE inclusive (SE omitted if missing). */
  segments: Segment[];
}

export interface ParsedGroup {
  gs: Segment;
  ge?: Segment;
  transactions: ParsedTransaction[];
}

export interface ParsedInterchange {
  delimiters: Delimiters;
  isa: Segment;
  iea?: Segment;
  groups: ParsedGroup[];
  segments: Segment[];
  /** Raw length of the ISA segment including its terminator (must be 106). */
  isaLength: number;
  /** Problems found while building the envelope tree (missing trailers, stray segments...). */
  structureIssues: X12Issue[];
}

export type IssueLevel = 'INTERCHANGE' | 'GROUP' | 'TRANSACTION' | 'SEGMENT' | 'ELEMENT' | 'BUSINESS';

/** Which acknowledgment segment the `x12Code` belongs to. */
export type AckCodeSource = 'TA1' | 'AK9' | 'AK5' | 'AK3' | 'AK4' | 'NONE';

export interface X12Issue {
  level: IssueLevel;
  /** Symbolic, human friendly code, e.g. `SE_SEGMENT_COUNT_MISMATCH`. */
  code: string;
  /** The standard X12 error code reported in the acknowledgment (TA1 I18, AK9 716, AK5 718, AK3 720, AK4 723). */
  x12Code?: string;
  x12CodeSource: AckCodeSource;
  severity: 'ERROR' | 'WARNING';
  message: string;
  segmentId?: string;
  /** Position of the segment inside its transaction set (ST = 1) or the interchange for envelope issues. */
  segmentPosition?: number;
  elementPosition?: number;
  elementRef?: string;
  badValue?: string;
  loopId?: string;
}

export type ElementType = 'AN' | 'ID' | 'N0' | 'N2' | 'R' | 'DT' | 'TM';

export interface ElementDef {
  /** Data element reference number from the X12 dictionary, e.g. `143`. */
  ref: string;
  name: string;
  type: ElementType;
  min: number;
  max: number;
  codes?: Record<string, string>;
}

export interface SegmentElementSpec extends ElementDef {
  /** M = mandatory, O = optional, X = conditional (treated as optional). */
  usage: 'M' | 'O' | 'X';
  /** camelCase JSON key. */
  key: string;
}

export interface SegmentSpec {
  id: string;
  name: string;
  key: string;
  purpose: string;
  elements: SegmentElementSpec[];
}

export type StructureNode =
  | { kind: 'segment'; id: string; usage: 'M' | 'O'; max: number }
  | { kind: 'loop'; id: string; name: string; key: string; usage: 'M' | 'O'; max: number; children: StructureNode[] };

export interface TransactionSpec {
  id: string;
  name: string;
  /** JSON type name, e.g. `832_PRICE_SALES_CATALOG`. */
  key: string;
  functionalId: string;
  description: string;
  structure: StructureNode[];
}

/** JSON tree produced from a transaction (see slide "X12 <> JSON Conversion"). */
export type X12JsonNode = { [key: string]: Array<Record<string, unknown>> };
