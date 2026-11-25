import { el } from './parser.js';
import type { Segment } from './types.js';

/**
 * Mappers: X12 segments → normalized business documents.
 * They read elements by position on purpose so the code doubles as a
 * reading guide: "LIN03 is the UPC when LIN02 = UP".
 */

export interface PartyRef {
  role: string;
  name?: string;
  idQualifier?: string;
  id?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface ItemIds {
  upc?: string;
  sku?: string;
}

export interface CatalogItem extends ItemIds {
  lineNumber?: string;
  description?: string;
  category?: string;
  pack?: number;
  size?: number;
  uom?: string;
  unitPrice?: number;
  priceType?: string;
}

export interface Catalog832 {
  type: '832';
  purpose: string;
  catalogNumber: string;
  catalogVersion?: string;
  effectiveDate?: string;
  parties: PartyRef[];
  items: CatalogItem[];
}

export interface InventoryItem extends ItemIds {
  description?: string;
  quantity?: number;
  quantityQualifier?: string;
  uom?: string;
  availableDate?: string;
}

export interface Inventory846 {
  type: '846';
  purpose: string;
  reportType: string;
  reportId: string;
  date: string;
  parties: PartyRef[];
  items: InventoryItem[];
}

export interface ShipmentItem extends ItemIds {
  description?: string;
  quantityShipped?: number;
  uom?: string;
}

export interface ShipNotice856 {
  type: '856';
  purpose: string;
  shipmentId: string;
  date: string;
  time: string;
  shippedDate?: string;
  carrier?: string;
  transportMethod?: string;
  billOfLading?: string;
  parties: PartyRef[];
  orders: Array<{ purchaseOrderNumber?: string; items: ShipmentItem[] }>;
}

export type NormalizedDocument = Catalog832 | Inventory846 | ShipNotice856;

const num = (v: string): number | undefined => (v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

function readIds(lin: Segment): ItemIds {
  const ids: ItemIds = {};
  for (let i = 2; i < lin.elements.length; i += 2) {
    const q = el(lin, i);
    const v = el(lin, i + 1);
    if (q === 'UP') ids.upc = v;
    if (q === 'VN' || q === 'SK') ids.sku = v;
  }
  return ids;
}

function readParties(body: Segment[]): PartyRef[] {
  const parties: PartyRef[] = [];
  let current: PartyRef | undefined;
  for (const s of body) {
    if (s.id === 'N1') {
      current = { role: el(s, 1), name: el(s, 2) || undefined, idQualifier: el(s, 3) || undefined, id: el(s, 4) || undefined };
      parties.push(current);
    } else if (s.id === 'N3' && current) current.address = el(s, 1);
    else if (s.id === 'N4' && current) Object.assign(current, { city: el(s, 1), state: el(s, 2), postalCode: el(s, 3) });
    else if (s.id === 'LIN' || s.id === 'HL') current = undefined;
  }
  return parties;
}

export function map832(body: Segment[]): Catalog832 {
  const bct = body.find((s) => s.id === 'BCT');
  const doc: Catalog832 = {
    type: '832',
    purpose: el(bct, 1),
    catalogNumber: el(bct, 2),
    catalogVersion: el(bct, 3) || undefined,
    effectiveDate: el(body.find((s) => s.id === 'DTM' && el(s, 1) === '007'), 2) || undefined,
    parties: readParties(body),
    items: [],
  };
  let item: CatalogItem | undefined;
  for (const s of body) {
    if (s.id === 'LIN') {
      item = { lineNumber: el(s, 1) || undefined, ...readIds(s) };
      doc.items.push(item);
    } else if (item && s.id === 'PID') {
      if (el(s, 2) === 'MAC') item.category = el(s, 5);
      else item.description = el(s, 5);
    } else if (item && s.id === 'PO4') {
      item.pack = num(el(s, 1));
      item.size = num(el(s, 2));
      item.uom = el(s, 3) || item.uom;
    } else if (item && s.id === 'CTP') {
      item.priceType = el(s, 2);
      item.unitPrice = num(el(s, 3));
      item.uom = item.uom ?? (el(s, 5) || undefined);
    }
  }
  return doc;
}

export function map846(body: Segment[]): Inventory846 {
  const bia = body.find((s) => s.id === 'BIA');
  const doc: Inventory846 = {
    type: '846',
    purpose: el(bia, 1),
    reportType: el(bia, 2),
    reportId: el(bia, 3),
    date: el(bia, 4),
    parties: readParties(body),
    items: [],
  };
  let item: InventoryItem | undefined;
  for (const s of body) {
    if (s.id === 'LIN') {
      item = readIds(s);
      doc.items.push(item);
    } else if (item && s.id === 'PID') item.description = el(s, 5);
    else if (item && s.id === 'QTY' && ['33', '17'].includes(el(s, 1))) {
      item.quantityQualifier = el(s, 1);
      item.quantity = num(el(s, 2));
      item.uom = el(s, 3) || undefined;
    } else if (item && s.id === 'DTM' && el(s, 1) === '018') item.availableDate = el(s, 2);
  }
  return doc;
}

export function map856(body: Segment[]): ShipNotice856 {
  const bsn = body.find((s) => s.id === 'BSN');
  const doc: ShipNotice856 = {
    type: '856',
    purpose: el(bsn, 1),
    shipmentId: el(bsn, 2),
    date: el(bsn, 3),
    time: el(bsn, 4),
    parties: readParties(body),
    orders: [],
  };
  const levels = new Map<string, { level: string; order?: ShipNotice856['orders'][number] }>();
  let level = '';
  let currentOrder: ShipNotice856['orders'][number] | undefined;
  let item: ShipmentItem | undefined;
  for (const s of body) {
    if (s.id === 'HL') {
      level = el(s, 3);
      const parent = levels.get(el(s, 2));
      item = undefined;
      if (level === 'O') {
        currentOrder = { items: [] };
        doc.orders.push(currentOrder);
        levels.set(el(s, 1), { level, order: currentOrder });
      } else if (level === 'I') {
        item = {};
        const order = parent?.order ?? currentOrder ?? (doc.orders[0] ??= { items: [] });
        order.items.push(item);
        levels.set(el(s, 1), { level, order });
      } else levels.set(el(s, 1), { level });
      continue;
    }
    if (level === 'S') {
      if (s.id === 'TD5') {
        doc.carrier = el(s, 3) || undefined;
        doc.transportMethod = el(s, 4) || undefined;
      } else if (s.id === 'REF' && el(s, 1) === 'BM') doc.billOfLading = el(s, 2);
      else if (s.id === 'DTM' && el(s, 1) === '011') doc.shippedDate = el(s, 2);
    } else if (level === 'O' && currentOrder && s.id === 'PRF') currentOrder.purchaseOrderNumber = el(s, 1);
    else if (level === 'I' && item) {
      if (s.id === 'LIN') Object.assign(item, readIds(s));
      else if (s.id === 'SN1') {
        item.quantityShipped = num(el(s, 2));
        item.uom = el(s, 3) || undefined;
      } else if (s.id === 'PID') item.description = el(s, 5);
    }
  }
  return doc;
}

export function mapTransaction(type: string, body: Segment[]): NormalizedDocument | undefined {
  switch (type) {
    case '832':
      return map832(body);
    case '846':
      return map846(body);
    case '856':
      return map856(body);
    default:
      return undefined;
  }
}
