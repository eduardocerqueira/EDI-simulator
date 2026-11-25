import { DISTRIBUTOR, type Producer, type ProductSeed } from '@edi/shared';
import { formatDate, formatTime, type SegmentArray } from '@edi/x12';
import { rand, pick, sample } from './random.js';

/** Price drifts a little on every catalog so the inventory history is interesting. */
const drift = (price: number) => Math.round(price * (0.92 + Math.random() * 0.16) * 100) / 100;

function supplierN1(producer: Producer): SegmentArray[] {
  return [
    ['N1', 'SU', producer.name.toUpperCase(), '92', producer.code],
    ['N3', producer.address.toUpperCase()],
    ['N4', producer.city.toUpperCase(), producer.state, producer.postalCode],
  ];
}

const lin = (p: ProductSeed, line?: number): SegmentArray => [
  'LIN', line ? String(line) : '', 'UP', p.upc, 'VN', p.sku,
];

/** 832 Price/Sales Catalog – the producer's full product list with prices. */
export function build832(producer: Producer, products: ProductSeed[], now = new Date()): SegmentArray[] {
  const body: SegmentArray[] = [
    ['BCT', 'PC', `CAT${formatDate(now, 6)}${rand(100, 999)}`, '1'],
    ['DTM', '007', formatDate(now, 8)],
    ...supplierN1(producer),
  ];
  products.forEach((p, i) => {
    body.push(
      lin(p, i + 1),
      ['PID', 'F', '08', '', '', p.name.toUpperCase()],
      ['PID', 'F', 'MAC', '', '', p.category.toUpperCase()],
      ['PO4', String(p.pack), String(p.size), p.uom],
      ['CTP', 'WS', 'WHL', drift(p.unitPrice).toFixed(2), '1', p.uom],
    );
  });
  body.push(['CTT', String(products.length)]);
  return body;
}

/** 846 Inventory Inquiry/Advice – quantity available for sale per product. */
export function build846(producer: Producer, products: ProductSeed[], now = new Date()): SegmentArray[] {
  const body: SegmentArray[] = [
    ['BIA', '00', 'DD', `INV${formatDate(now, 6)}${rand(1000, 9999)}`, formatDate(now, 8), formatTime(now)],
    ['DTM', '007', formatDate(now, 8)],
    ...supplierN1(producer),
  ];
  for (const p of products) {
    body.push(
      lin(p),
      ['PID', 'F', '08', '', '', p.name.toUpperCase()],
      ['QTY', '33', String(rand(20, 600)), p.uom],
    );
  }
  body.push(['CTT', String(products.length)]);
  return body;
}

/** 856 Ship Notice – hierarchical Shipment > Order > Item structure. */
export function build856(producer: Producer, products: ProductSeed[], now = new Date()): SegmentArray[] {
  const ship = new Date(now.getTime() - 2 * 3600_000);
  const body: SegmentArray[] = [
    ['BSN', '00', `SHP${formatDate(now, 6)}${rand(1000, 9999)}`, formatDate(now, 8), formatTime(now)],
    ['HL', '1', '', 'S', '1'],
    ['TD5', 'B', '2', pick(['FFLC', 'ODFL', 'RDWY', 'UPSN']), 'M'],
    ['REF', 'BM', `BOL${rand(100000, 999999)}`],
    ['DTM', '011', formatDate(ship, 8), formatTime(ship)],
    ['N1', 'SF', producer.name.toUpperCase(), '92', producer.code],
    ['N4', producer.city.toUpperCase(), producer.state, producer.postalCode],
    ['N1', 'ST', DISTRIBUTOR.name.toUpperCase(), '92', DISTRIBUTOR.n1Code],
    ['N3', DISTRIBUTOR.address.toUpperCase()],
    ['N4', DISTRIBUTOR.city.toUpperCase(), DISTRIBUTOR.state, DISTRIBUTOR.postalCode],
  ];
  let hl = 2;
  const orders = products.length > 3 ? 2 : 1;
  const perOrder = Math.ceil(products.length / orders);
  for (let o = 0; o < orders; o++) {
    const orderHl = hl++;
    body.push(['HL', String(orderHl), '1', 'O', '1'], ['PRF', `PO${formatDate(now, 6)}${rand(100, 999)}`]);
    for (const p of products.slice(o * perOrder, (o + 1) * perOrder)) {
      body.push(
        ['HL', String(hl++), String(orderHl), 'I', '0'],
        lin(p),
        ['SN1', '', String(rand(10, 120)), p.uom],
        ['PID', 'F', '08', '', '', p.name.toUpperCase()],
      );
    }
  }
  body.push(['CTT', String(hl - 1)]);
  return body;
}

export const BUILDERS = { '832': build832, '846': build846, '856': build856 } as const;
export type SupportedType = keyof typeof BUILDERS;

export function chooseProducts(all: ProductSeed[], type: SupportedType): ProductSeed[] {
  if (type === '832') return all;
  return sample(all, rand(3, Math.min(8, all.length)));
}
