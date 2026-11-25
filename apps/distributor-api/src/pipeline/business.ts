import { upcCheckDigit, type InventorySyncPayload } from '@edi/shared';
import type { Catalog832, Inventory846, NormalizedDocument, ShipNotice856, X12Issue } from '@edi/x12';
import { config } from '../config.js';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/index.js';

type Partner = { id: string; code: string; name: string; isaId: string };

const biz = (code: string, message: string, extra: Partial<X12Issue> = {}): X12Issue => ({
  level: 'BUSINESS', code, x12CodeSource: 'NONE', severity: 'ERROR', message, ...extra,
});

const validUpc = (upc: string | undefined) => !!upc && /^\d{12}$/.test(upc) && upcCheckDigit(upc.slice(0, 11)) === upc[11];

/**
 * Business validation runs only on transaction sets that passed syntax
 * validation (997 AK5 = A). A syntactically perfect document can still be
 * wrong for the business: unknown products, someone else's product, bad prices.
 */
export async function validateBusiness(doc: NormalizedDocument, partner: Partner): Promise<X12Issue[]> {
  const issues: X12Issue[] = [];
  const supplierRole = doc.type === '856' ? 'SF' : 'SU';
  const supplier = doc.parties.find((p) => p.role === supplierRole);
  if (supplier?.id && supplier.id !== partner.code) {
    issues.push(biz('SUPPLIER_MISMATCH', `N1*${supplierRole} identifies supplier "${supplier.id}" but the interchange came from ${partner.code} (${partner.isaId})`, { segmentId: 'N1', badValue: supplier.id }));
  }
  if (doc.type === '856') {
    const shipTo = doc.parties.find((p) => p.role === 'ST');
    if (shipTo?.id && shipTo.id !== config.identity.n1Code) {
      issues.push(biz('SHIP_TO_MISMATCH', `Shipment is addressed to "${shipTo.id}", not to ${config.identity.n1Code}`, { segmentId: 'N1', badValue: shipTo.id }));
    }
  }

  const items = doc.type === '856' ? doc.orders.flatMap((o) => o.items) : doc.items;
  if (!items.length) issues.push(biz('NO_ITEMS', 'The document contains no line items'));
  const upcs = items.map((i) => i.upc).filter((u): u is string => !!u);
  const existing = await prisma.product.findMany({ where: { upc: { in: upcs } }, include: { partner: true } });
  const byUpc = new Map(existing.map((p) => [p.upc, p]));

  items.forEach((item, idx) => {
    const line = `Line ${idx + 1} (UPC ${item.upc ?? '—'})`;
    if (!validUpc(item.upc)) {
      issues.push(biz('INVALID_UPC', `${line}: UPC is missing or has a bad check digit`, { segmentId: 'LIN', badValue: item.upc }));
      return;
    }
    const known = byUpc.get(item.upc!);
    if (known && known.partnerId !== partner.id) {
      issues.push(biz('FOREIGN_PRODUCT', `${line}: product "${known.name}" belongs to ${known.partner.name}, not ${partner.name}`, { segmentId: 'LIN', badValue: item.upc }));
      return;
    }
    if (doc.type === '832') {
      const c = item as Catalog832['items'][number];
      if (!c.description) issues.push(biz('MISSING_DESCRIPTION', `${line}: product description (PID*F*08) is required`, { segmentId: 'PID' }));
      if (c.unitPrice === undefined || c.unitPrice <= 0) {
        issues.push(biz('INVALID_PRICE', `${line}: unit price must be greater than zero (got ${c.unitPrice})`, { segmentId: 'CTP', badValue: String(c.unitPrice) }));
      } else if (known && c.unitPrice > known.unitCost * 5) {
        issues.push(biz('PRICE_SPIKE', `${line}: price ${c.unitPrice} is more than 5x the current cost ${known.unitCost}`, { segmentId: 'CTP', badValue: String(c.unitPrice) }));
      }
    } else {
      if (!known) {
        issues.push(biz('UNKNOWN_PRODUCT', `${line}: product is not in the catalog — send an 832 first`, { segmentId: 'LIN', badValue: item.upc }));
        return;
      }
      const qty = doc.type === '846' ? (item as Inventory846['items'][number]).quantity : (item as ShipNotice856['orders'][number]['items'][number]).quantityShipped;
      if (qty === undefined) issues.push(biz('MISSING_QUANTITY', `${line}: quantity is missing`, { segmentId: doc.type === '846' ? 'QTY' : 'SN1' }));
      else if (qty < 0 || (doc.type === '856' && qty === 0)) {
        issues.push(biz('INVALID_QUANTITY', `${line}: quantity ${qty} is not allowed`, { segmentId: doc.type === '846' ? 'QTY' : 'SN1', badValue: String(qty) }));
      }
    }
  });
  return issues;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Ingest a validated document into the inventory (inside one DB transaction)
 * and return the items to push to the order app.
 */
export async function ingest(
  tx: Prisma.TransactionClient,
  doc: NormalizedDocument,
  partner: Partner,
  transactionId: string,
): Promise<InventorySyncPayload['items']> {
  const touched: string[] = [];
  if (doc.type === '832') {
    for (const item of doc.items) {
      const before = await tx.product.findUnique({ where: { upc: item.upc! } });
      const unitCost = item.unitPrice!;
      const data = {
        sku: item.sku ?? item.upc!, name: titleCase(item.description ?? item.upc!), category: titleCase(item.category ?? 'Uncategorized'),
        uom: item.uom ?? 'EA', pack: item.pack, size: item.size, unitCost, sellPrice: round2(unitCost * (1 + config.markup)), lastTransactionId: transactionId,
      };
      const p = await tx.product.upsert({ where: { upc: item.upc! }, create: { ...data, upc: item.upc!, partnerId: partner.id }, update: data });
      await tx.inventoryMovement.create({
        data: {
          productId: p.id, transactionId, type: 'CATALOG', quantityDelta: 0, quantityAfter: p.quantityOnHand, unitCost,
          note: before ? `Price ${before.unitCost.toFixed(2)} → ${unitCost.toFixed(2)}` : 'Added to catalog',
        },
      });
      touched.push(p.id);
    }
  } else if (doc.type === '846') {
    for (const item of doc.items) {
      const before = await tx.product.findUniqueOrThrow({ where: { upc: item.upc! } });
      const qty = Math.round(item.quantity ?? 0);
      const p = await tx.product.update({ where: { id: before.id }, data: { quantityOnHand: qty, lastTransactionId: transactionId } });
      await tx.inventoryMovement.create({
        data: { productId: p.id, transactionId, type: 'INVENTORY_ADVICE', quantityDelta: qty - before.quantityOnHand, quantityAfter: qty, note: `Producer advises ${qty} ${item.uom ?? ''} available (QTY*${item.quantityQualifier})` },
      });
      touched.push(p.id);
    }
  } else {
    for (const order of doc.orders) {
      for (const item of order.items) {
        const qty = Math.round(item.quantityShipped ?? 0);
        const p = await tx.product.update({ where: { upc: item.upc! }, data: { quantityOnHand: { increment: qty }, lastTransactionId: transactionId } });
        await tx.inventoryMovement.create({
          data: { productId: p.id, transactionId, type: 'RECEIPT', quantityDelta: qty, quantityAfter: p.quantityOnHand, note: `ASN ${doc.shipmentId} / PO ${order.purchaseOrderNumber ?? '—'} received` },
        });
        touched.push(p.id);
      }
    }
  }
  const products = await tx.product.findMany({ where: { id: { in: touched } } });
  return products.map((p) => ({
    upc: p.upc, sku: p.sku, name: p.name, category: p.category, uom: p.uom, price: p.sellPrice,
    quantityAvailable: Math.max(0, p.quantityOnHand - p.quantityReserved),
  }));
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|And|The)\b/g, (m) => m.toLowerCase());
}
