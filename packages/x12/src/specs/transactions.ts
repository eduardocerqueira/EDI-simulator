import type { StructureNode, TransactionSpec } from '../types.js';

const S = (id: string, usage: 'M' | 'O', max = 1): StructureNode => ({ kind: 'segment', id, usage, max });
const L = (id: string, name: string, key: string, usage: 'M' | 'O', max: number, children: StructureNode[]): StructureNode => ({
  kind: 'loop', id, name, key, usage, max, children,
});

const N1_LOOP = (max = 200) =>
  L('N1', 'Party Identification Loop', 'partyIdentificationLoop', 'O', max, [S('N1', 'M'), S('N3', 'O', 2), S('N4', 'O')]);

/**
 * Simplified implementation guides (Harvest Hub "farm-to-table" guide, X12 004010).
 * Segment order matters: X12 requires segments to appear in the sequence defined here.
 */
export const TRANSACTIONS: Record<string, TransactionSpec> = {
  '832': {
    id: '832',
    name: 'Price/Sales Catalog',
    key: '832_PRICE_SALES_CATALOG',
    functionalId: 'SC',
    description: 'Producer publishes its product catalog (items, descriptions, packaging and prices) to the distributor.',
    structure: [
      S('BCT', 'M'),
      S('DTM', 'O', 10),
      N1_LOOP(),
      L('LIN', 'Item Identification Loop', 'itemIdentificationLoop', 'M', 100000, [S('LIN', 'M'), S('PID', 'O', 200), S('PO4', 'O'), S('CTP', 'O', 25)]),
      S('CTT', 'M'),
    ],
  },
  '846': {
    id: '846',
    name: 'Inventory Inquiry/Advice',
    key: '846_INVENTORY_INQUIRY_ADVICE',
    functionalId: 'IB',
    description: 'Producer advises the distributor how much of each product is available for sale.',
    structure: [
      S('BIA', 'M'),
      S('DTM', 'O', 10),
      N1_LOOP(),
      L('LIN', 'Item Identification Loop', 'itemIdentificationLoop', 'M', 10000, [S('LIN', 'M'), S('PID', 'O', 200), S('QTY', 'M', 99), S('DTM', 'O', 10)]),
      S('CTT', 'M'),
    ],
  },
  '856': {
    id: '856',
    name: 'Ship Notice/Manifest',
    key: '856_SHIP_NOTICE_MANIFEST',
    functionalId: 'SH',
    description: 'Advance Ship Notice (ASN): producer tells the distributor what was shipped, so stock can be received.',
    structure: [
      S('BSN', 'M'),
      S('DTM', 'O', 10),
      L('HL', 'Hierarchical Level Loop', 'hierarchicalLevelLoop', 'M', 200000, [
        S('HL', 'M'), S('LIN', 'O'), S('SN1', 'O'), S('PRF', 'O'), S('PID', 'O', 200), S('TD5', 'O', 12), S('REF', 'O', 200), S('DTM', 'O', 10), N1_LOOP(),
      ]),
      S('CTT', 'M'),
    ],
  },
  '997': {
    id: '997',
    name: 'Functional Acknowledgment',
    key: '997_FUNCTIONAL_ACKNOWLEDGMENT',
    functionalId: 'FA',
    description: 'Receiver reports whether each functional group / transaction set was syntactically accepted or rejected.',
    structure: [
      S('AK1', 'M'),
      L('AK2', 'Transaction Set Response Loop', 'transactionSetResponseLoop', 'O', 999999, [
        S('AK2', 'M'),
        L('AK3', 'Data Segment Note Loop', 'dataSegmentNoteLoop', 'O', 999999, [S('AK3', 'M'), S('AK4', 'O', 99)]),
        S('AK5', 'M'),
      ]),
      S('AK9', 'M'),
    ],
  },
};

export const FUNCTIONAL_ID_BY_TRANSACTION: Record<string, string> = Object.fromEntries(
  Object.values(TRANSACTIONS).map((t) => [t.id, t.functionalId]),
);

export function getTransactionSpec(id: string): TransactionSpec | undefined {
  return TRANSACTIONS[id];
}

/** Every segment ID that appears anywhere in a structure. */
export function segmentIdsOf(nodes: StructureNode[], acc = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind === 'segment') acc.add(n.id);
    else segmentIdsOf(n.children, acc);
  }
  return acc;
}
