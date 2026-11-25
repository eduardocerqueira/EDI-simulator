import type { ElementDef, SegmentElementSpec, SegmentSpec } from '../types.js';

/**
 * A compact X12 004010 data-element dictionary — only the elements used by
 * the transaction sets this simulator supports. Names follow the X12 dictionary.
 */
const D = {
  // ---- Interchange (ISA / IEA / TA1) ----
  I01: { ref: 'I01', name: 'Authorization Information Qualifier', type: 'ID', min: 2, max: 2, codes: { '00': 'No Authorization Information Present', '03': 'Additional Data Identification' } },
  I02: { ref: 'I02', name: 'Authorization Information', type: 'AN', min: 10, max: 10 },
  I03: { ref: 'I03', name: 'Security Information Qualifier', type: 'ID', min: 2, max: 2, codes: { '00': 'No Security Information Present', '01': 'Password' } },
  I04: { ref: 'I04', name: 'Security Information', type: 'AN', min: 10, max: 10 },
  I05: { ref: 'I05', name: 'Interchange ID Qualifier', type: 'ID', min: 2, max: 2, codes: { '01': 'Duns (Dun & Bradstreet)', '08': 'UCC EDI Communications ID', '12': 'Phone (Telephone Companies)', '14': 'Duns Plus Suffix', ZZ: 'Mutually Defined' } },
  I06: { ref: 'I06', name: 'Interchange Sender ID', type: 'AN', min: 15, max: 15 },
  I07: { ref: 'I07', name: 'Interchange Receiver ID', type: 'AN', min: 15, max: 15 },
  I08: { ref: 'I08', name: 'Interchange Date', type: 'DT', min: 6, max: 6 },
  I09: { ref: 'I09', name: 'Interchange Time', type: 'TM', min: 4, max: 4 },
  I10: { ref: 'I10', name: 'Interchange Control Standards Identifier', type: 'ID', min: 1, max: 1, codes: { U: 'U.S. EDI Community of ASC X12' } },
  I11: { ref: 'I11', name: 'Interchange Control Version Number', type: 'ID', min: 5, max: 5, codes: { '00401': 'Standards Approved for Publication by ASC X12 Procedures Review Board through October 1997' } },
  I12: { ref: 'I12', name: 'Interchange Control Number', type: 'N0', min: 9, max: 9 },
  I13: { ref: 'I13', name: 'Acknowledgment Requested', type: 'ID', min: 1, max: 1, codes: { '0': 'No Acknowledgment Requested', '1': 'Interchange Acknowledgment (TA1) Requested' } },
  I14: { ref: 'I14', name: 'Usage Indicator', type: 'ID', min: 1, max: 1, codes: { P: 'Production Data', T: 'Test Data', I: 'Information' } },
  I15: { ref: 'I15', name: 'Component Element Separator', type: 'AN', min: 1, max: 1 },
  I16: { ref: 'I16', name: 'Number of Included Functional Groups', type: 'N0', min: 1, max: 5 },
  I17: { ref: 'I17', name: 'Interchange Acknowledgment Code', type: 'ID', min: 1, max: 1, codes: { A: 'Accepted', E: 'Accepted with Errors', R: 'Rejected' } },
  I18: { ref: 'I18', name: 'Interchange Note Code', type: 'ID', min: 3, max: 3 },

  // ---- Functional group / transaction set envelope ----
  '479': { ref: '479', name: 'Functional Identifier Code', type: 'ID', min: 2, max: 2, codes: { SC: 'Price/Sales Catalog (832)', IB: 'Inventory Inquiry/Advice (846)', SH: 'Ship Notice/Manifest (856)', FA: 'Functional Acknowledgment (997)', PO: 'Purchase Order (850)', IN: 'Invoice (810)' } },
  '142': { ref: '142', name: 'Application Sender Code', type: 'AN', min: 2, max: 15 },
  '124': { ref: '124', name: 'Application Receiver Code', type: 'AN', min: 2, max: 15 },
  '373': { ref: '373', name: 'Date', type: 'DT', min: 8, max: 8 },
  '337': { ref: '337', name: 'Time', type: 'TM', min: 4, max: 8 },
  '28': { ref: '28', name: 'Group Control Number', type: 'N0', min: 1, max: 9 },
  '455': { ref: '455', name: 'Responsible Agency Code', type: 'ID', min: 1, max: 2, codes: { X: 'Accredited Standards Committee X12', T: 'Transportation Data Coordinating Committee (TDCC)' } },
  '480': { ref: '480', name: 'Version / Release / Industry Identifier Code', type: 'AN', min: 1, max: 12, codes: { '004010': 'Draft Standards Approved for Publication by ASC X12 Procedures Review Board through October 1997' } },
  '97': { ref: '97', name: 'Number of Transaction Sets Included', type: 'N0', min: 1, max: 6 },
  '143': { ref: '143', name: 'Transaction Set Identifier Code', type: 'ID', min: 3, max: 3, codes: { '832': 'Price/Sales Catalog', '846': 'Inventory Inquiry/Advice', '856': 'Ship Notice/Manifest', '997': 'Functional Acknowledgment', '850': 'Purchase Order', '810': 'Invoice' } },
  '329': { ref: '329', name: 'Transaction Set Control Number', type: 'AN', min: 4, max: 9 },
  '96': { ref: '96', name: 'Number of Included Segments', type: 'N0', min: 1, max: 10 },

  // ---- Shared business elements ----
  '353': { ref: '353', name: 'Transaction Set Purpose Code', type: 'ID', min: 2, max: 2, codes: { '00': 'Original', '01': 'Cancellation', '05': 'Replace', '06': 'Confirmation' } },
  '374': { ref: '374', name: 'Date/Time Qualifier', type: 'ID', min: 3, max: 3, codes: { '002': 'Delivery Requested', '007': 'Effective', '010': 'Requested Ship', '011': 'Shipped', '017': 'Estimated Delivery', '018': 'Available', '036': 'Expiration' } },
  '98': { ref: '98', name: 'Entity Identifier Code', type: 'ID', min: 2, max: 3, codes: { SU: 'Supplier/Manufacturer', SF: 'Ship From', ST: 'Ship To', BY: 'Buying Party (Purchaser)', BT: 'Bill-to-Party', DS: 'Distributor' } },
  '93': { ref: '93', name: 'Name', type: 'AN', min: 1, max: 60 },
  '66': { ref: '66', name: 'Identification Code Qualifier', type: 'ID', min: 1, max: 2, codes: { '1': 'D-U-N-S Number, Dun & Bradstreet', '2': 'Standard Carrier Alpha Code (SCAC)', '9': 'D-U-N-S+4', '91': 'Assigned by Seller or Seller\'s Agent', '92': 'Assigned by Buyer or Buyer\'s Agent', ZZ: 'Mutually Defined' } },
  '67': { ref: '67', name: 'Identification Code', type: 'AN', min: 2, max: 80 },
  '166': { ref: '166', name: 'Address Information', type: 'AN', min: 1, max: 55 },
  '19': { ref: '19', name: 'City Name', type: 'AN', min: 2, max: 30 },
  '156': { ref: '156', name: 'State or Province Code', type: 'ID', min: 2, max: 2 },
  '116': { ref: '116', name: 'Postal Code', type: 'ID', min: 3, max: 15 },
  '26': { ref: '26', name: 'Country Code', type: 'ID', min: 2, max: 3 },
  '350': { ref: '350', name: 'Assigned Identification', type: 'AN', min: 1, max: 20 },
  '235': { ref: '235', name: 'Product/Service ID Qualifier', type: 'ID', min: 2, max: 2, codes: { UP: 'U.P.C. Consumer Package Code (1-5-5-1)', VN: 'Vendor\'s (Seller\'s) Item Number', SK: 'Stock Keeping Unit (SKU)', BP: 'Buyer\'s Part Number', EN: 'European Article Number (EAN)' } },
  '234': { ref: '234', name: 'Product/Service ID', type: 'AN', min: 1, max: 48 },
  '349': { ref: '349', name: 'Item Description Type', type: 'ID', min: 1, max: 1, codes: { F: 'Free-form', S: 'Structured (From Industry Code List)', X: 'Semi-structured' } },
  '750': { ref: '750', name: 'Product/Process Characteristic Code', type: 'ID', min: 2, max: 3, codes: { '08': 'Product', MAC: 'Material Classification', TRN: 'Trade Name' } },
  '559': { ref: '559', name: 'Agency Qualifier Code', type: 'ID', min: 2, max: 2 },
  '751': { ref: '751', name: 'Product Description Code', type: 'AN', min: 1, max: 12 },
  '352': { ref: '352', name: 'Description', type: 'AN', min: 1, max: 80 },
  '356': { ref: '356', name: 'Pack', type: 'N0', min: 1, max: 6 },
  '357': { ref: '357', name: 'Size', type: 'R', min: 1, max: 8 },
  '355': { ref: '355', name: 'Unit or Basis for Measurement Code', type: 'ID', min: 2, max: 2, codes: { LB: 'Pound', EA: 'Each', DZ: 'Dozen', GA: 'Gallon', BX: 'Box', CA: 'Case', BU: 'Bushel', OZ: 'Ounce', KG: 'Kilogram', BG: 'Bag', JR: 'Jar', PK: 'Package' } },
  '687': { ref: '687', name: 'Class of Trade Code', type: 'ID', min: 2, max: 2, codes: { WS: 'Warehouse', RS: 'Resale', DE: 'Dealer' } },
  '236': { ref: '236', name: 'Price Identifier Code', type: 'ID', min: 3, max: 3, codes: { WHL: 'Wholesale', RES: 'Resale', CON: 'Contract Price', CAT: 'Catalog Price' } },
  '212': { ref: '212', name: 'Unit Price', type: 'R', min: 1, max: 17 },
  '380': { ref: '380', name: 'Quantity', type: 'R', min: 1, max: 15 },
  '354': { ref: '354', name: 'Number of Line Items', type: 'N0', min: 1, max: 6 },
  '347': { ref: '347', name: 'Hash Total', type: 'R', min: 1, max: 10 },
  '683': { ref: '683', name: 'Catalog Purpose Code', type: 'ID', min: 2, max: 2, codes: { PC: 'Price Catalog', SC: 'Sales Catalog', RC: 'Replacement Catalog' } },
  '684': { ref: '684', name: 'Catalog Number', type: 'AN', min: 1, max: 15 },
  '685': { ref: '685', name: 'Catalog Version Number', type: 'AN', min: 1, max: 15 },
  '686': { ref: '686', name: 'Catalog Revision Number', type: 'AN', min: 1, max: 15 },
  '755': { ref: '755', name: 'Report Type Code', type: 'ID', min: 2, max: 2, codes: { DD: 'Distributor Inventory Report', SI: 'Seller Inventory Report', MM: 'Material Management' } },
  '127': { ref: '127', name: 'Reference Identification', type: 'AN', min: 1, max: 30 },
  '128': { ref: '128', name: 'Reference Identification Qualifier', type: 'ID', min: 2, max: 3, codes: { BM: 'Bill of Lading Number', PO: 'Purchase Order Number', CN: 'Carrier\'s Reference Number (PRO/Invoice)', IA: 'Internal Vendor Number', DP: 'Department Number', LT: 'Lot Number' } },
  '673': { ref: '673', name: 'Quantity Qualifier', type: 'ID', min: 2, max: 2, codes: { '33': 'Quantity Available for Sale (Stock Quantity)', '17': 'Quantity on Hand', '02': 'Cumulative Quantity', '38': 'Original Quantity' } },
  '396': { ref: '396', name: 'Shipment Identification', type: 'AN', min: 2, max: 30 },
  '628': { ref: '628', name: 'Hierarchical ID Number', type: 'AN', min: 1, max: 12 },
  '734': { ref: '734', name: 'Hierarchical Parent ID Number', type: 'AN', min: 1, max: 12 },
  '735': { ref: '735', name: 'Hierarchical Level Code', type: 'ID', min: 1, max: 2, codes: { S: 'Shipment', O: 'Order', P: 'Pack', I: 'Item', T: 'Shipping Tare' } },
  '736': { ref: '736', name: 'Hierarchical Child Code', type: 'ID', min: 1, max: 1, codes: { '0': 'No Subordinate HL Segment in This Hierarchical Structure', '1': 'Additional Subordinate HL Data Segment in This Hierarchical Structure' } },
  '133': { ref: '133', name: 'Routing Sequence Code', type: 'ID', min: 1, max: 2, codes: { B: 'Origin/Delivery Carrier (Any Mode)', O: 'Origin Carrier (Air, Motor, or Ocean)' } },
  '91': { ref: '91', name: 'Transportation Method/Type Code', type: 'ID', min: 1, max: 2, codes: { M: 'Motor (Common Carrier)', A: 'Air', R: 'Rail', U: 'Private Parcel Service' } },
  '324': { ref: '324', name: 'Purchase Order Number', type: 'AN', min: 1, max: 22 },
  '382': { ref: '382', name: 'Number of Units Shipped', type: 'R', min: 1, max: 10 },

  // ---- 997 ----
  '721': { ref: '721', name: 'Segment ID Code', type: 'ID', min: 2, max: 3 },
  '719': { ref: '719', name: 'Segment Position in Transaction Set', type: 'N0', min: 1, max: 6 },
  '447': { ref: '447', name: 'Loop Identifier Code', type: 'AN', min: 1, max: 6 },
  '720': { ref: '720', name: 'Segment Syntax Error Code', type: 'ID', min: 1, max: 3 },
  C030: { ref: 'C030', name: 'Position in Segment', type: 'N0', min: 1, max: 2 },
  '725': { ref: '725', name: 'Data Element Reference Number', type: 'N0', min: 1, max: 4 },
  '723': { ref: '723', name: 'Data Element Syntax Error Code', type: 'ID', min: 1, max: 3 },
  '724': { ref: '724', name: 'Copy of Bad Data Element', type: 'AN', min: 1, max: 99 },
  '717': { ref: '717', name: 'Transaction Set Acknowledgment Code', type: 'ID', min: 1, max: 1, codes: { A: 'Accepted', E: 'Accepted But Errors Were Noted', R: 'Rejected' } },
  '718': { ref: '718', name: 'Transaction Set Syntax Error Code', type: 'ID', min: 1, max: 3 },
  '715': { ref: '715', name: 'Functional Group Acknowledge Code', type: 'ID', min: 1, max: 1, codes: { A: 'Accepted', E: 'Accepted But Errors Were Noted', P: 'Partially Accepted', R: 'Rejected' } },
  '123': { ref: '123', name: 'Number of Received Transaction Sets', type: 'N0', min: 1, max: 6 },
  '2': { ref: '2', name: 'Number of Accepted Transaction Sets', type: 'N0', min: 1, max: 6 },
  '716': { ref: '716', name: 'Functional Group Syntax Error Code', type: 'ID', min: 1, max: 3 },
} satisfies Record<string, ElementDef>;

type Ref = keyof typeof D;

function camel(name: string): string {
  return name
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

/** Build a segment element spec. `key` defaults to the camelCase element name. */
function el(ref: Ref, usage: 'M' | 'O' | 'X', overrides: Partial<SegmentElementSpec> = {}): SegmentElementSpec {
  const def = D[ref] as ElementDef;
  return { ...def, usage, key: overrides.key ?? camel(overrides.name ?? def.name), ...overrides };
}

function seg(id: string, name: string, purpose: string, elements: SegmentElementSpec[]): SegmentSpec {
  return { id, name, key: camel(name), purpose, elements };
}

export const SEGMENTS: Record<string, SegmentSpec> = {
  ISA: seg('ISA', 'Interchange Control Header', 'Starts the interchange (the "electronic envelope"). Fixed length of 106 characters; it also defines the delimiters.', [
    el('I01', 'M'), el('I02', 'M'), el('I03', 'M'), el('I04', 'M'),
    el('I05', 'M', { key: 'interchangeSenderIdQualifier', name: 'Interchange ID Qualifier (Sender)' }), el('I06', 'M'),
    el('I05', 'M', { key: 'interchangeReceiverIdQualifier', name: 'Interchange ID Qualifier (Receiver)' }), el('I07', 'M'),
    el('I08', 'M'), el('I09', 'M'), el('I10', 'M'), el('I11', 'M'), el('I12', 'M'), el('I13', 'M'), el('I14', 'M'), el('I15', 'M'),
  ]),
  IEA: seg('IEA', 'Interchange Control Trailer', 'Closes the interchange. IEA02 must equal ISA13 and IEA01 must equal the number of GS/GE groups.', [el('I16', 'M'), el('I12', 'M')]),
  TA1: seg('TA1', 'Interchange Acknowledgment', 'Reports the receipt status of an interchange header/trailer.', [el('I12', 'M'), el('I08', 'M'), el('I09', 'M'), el('I17', 'M'), el('I18', 'M')]),
  GS: seg('GS', 'Functional Group Header', 'Starts a functional group: a batch of transaction sets of the same type (GS01 identifies the type).', [
    el('479', 'M'), el('142', 'M'), el('124', 'M'), el('373', 'M'), el('337', 'M'), el('28', 'M'), el('455', 'M'), el('480', 'M'),
  ]),
  GE: seg('GE', 'Functional Group Trailer', 'Closes the functional group. GE01 = number of ST/SE sets, GE02 = GS06.', [el('97', 'M'), el('28', 'M')]),
  ST: seg('ST', 'Transaction Set Header', 'Starts one business document (e.g. one catalog, one inventory advice).', [el('143', 'M'), el('329', 'M')]),
  SE: seg('SE', 'Transaction Set Trailer', 'Closes the transaction set. SE01 = number of segments from ST to SE inclusive, SE02 = ST02.', [el('96', 'M'), el('329', 'M')]),

  BCT: seg('BCT', 'Beginning Segment for Price/Sales Catalog', 'Identifies the catalog being transmitted.', [el('683', 'M'), el('684', 'M'), el('685', 'O'), el('686', 'O')]),
  BIA: seg('BIA', 'Beginning Segment for Inventory Inquiry/Advice', 'Identifies the inventory report.', [el('353', 'M'), el('755', 'M'), el('127', 'M'), el('373', 'M'), el('337', 'O')]),
  BSN: seg('BSN', 'Beginning Segment for Ship Notice', 'Identifies the shipment (Advance Ship Notice).', [el('353', 'M'), el('396', 'M'), el('373', 'M'), el('337', 'M')]),
  DTM: seg('DTM', 'Date/Time Reference', 'A date qualified by DTM01 (the qualifier says what the date means).', [el('374', 'M'), el('373', 'X'), el('337', 'O')]),
  REF: seg('REF', 'Reference Information', 'A reference number qualified by REF01.', [el('128', 'M'), el('127', 'X')]),
  N1: seg('N1', 'Party Identification', 'Names a party; N101 qualifier tells which role (supplier, ship-to...). Starts the N1 loop.', [el('98', 'M'), el('93', 'X'), el('66', 'X'), el('67', 'X')]),
  N3: seg('N3', 'Party Location', 'Street address of the party in the current N1 loop.', [el('166', 'M', { key: 'addressInformation' }), el('166', 'O', { key: 'addressInformation2' })]),
  N4: seg('N4', 'Geographic Location', 'City, state and postal code of the party in the current N1 loop.', [el('19', 'O'), el('156', 'O'), el('116', 'O'), el('26', 'O')]),
  LIN: seg('LIN', 'Item Identification', 'Identifies a product with qualifier/ID pairs (UP = UPC, VN = vendor item number).', [
    el('350', 'O'),
    el('235', 'M', { key: 'productServiceIdQualifier' }), el('234', 'M', { key: 'productServiceId' }),
    el('235', 'X', { key: 'productServiceIdQualifier2' }), el('234', 'X', { key: 'productServiceId2' }),
  ]),
  PID: seg('PID', 'Product/Item Description', 'Free-form (F) or structured (S) description of the item.', [el('349', 'M'), el('750', 'O'), el('559', 'O'), el('751', 'O'), el('352', 'X')]),
  PO4: seg('PO4', 'Item Physical Details', 'Packaging: pack, size, unit of measure.', [el('356', 'O'), el('357', 'O'), el('355', 'X')]),
  CTP: seg('CTP', 'Pricing Information', 'Price of the item for a class of trade.', [el('687', 'O'), el('236', 'M'), el('212', 'M'), el('380', 'O'), el('355', 'O', { key: 'compositeUnitOfMeasure' })]),
  QTY: seg('QTY', 'Quantity Information', 'A quantity qualified by QTY01.', [el('673', 'M'), el('380', 'M'), el('355', 'O', { key: 'compositeUnitOfMeasure' })]),
  CTT: seg('CTT', 'Transaction Totals', 'Control totals (number of line items / HL segments) used to check completeness.', [el('354', 'M'), el('347', 'O')]),
  HL: seg('HL', 'Hierarchical Level', 'Builds the shipment > order > item hierarchy. HL02 points to the parent HL01.', [el('628', 'M'), el('734', 'O'), el('735', 'M'), el('736', 'O')]),
  TD5: seg('TD5', 'Carrier Details (Routing Sequence/Transit Time)', 'Carrier and transport mode.', [el('133', 'O'), el('66', 'X'), el('67', 'X'), el('91', 'X')]),
  PRF: seg('PRF', 'Purchase Order Reference', 'Purchase order this shipment fulfils.', [el('324', 'M')]),
  SN1: seg('SN1', 'Item Detail (Shipment)', 'Quantity of the item shipped.', [el('350', 'O'), el('382', 'M'), el('355', 'M')]),

  AK1: seg('AK1', 'Functional Group Response Header', 'Which functional group (GS01/GS06) this 997 acknowledges.', [el('479', 'M'), el('28', 'M')]),
  AK2: seg('AK2', 'Transaction Set Response Header', 'Which transaction set (ST01/ST02) the following AK3/AK4/AK5 refer to.', [el('143', 'M'), el('329', 'M')]),
  AK3: seg('AK3', 'Data Segment Note', 'A segment with errors: its ID, position and the error code.', [el('721', 'M'), el('719', 'M'), el('447', 'O'), el('720', 'O')]),
  AK4: seg('AK4', 'Data Element Note', 'An element with errors inside the preceding AK3 segment.', [el('C030', 'M'), el('725', 'O'), el('723', 'M'), el('724', 'O')]),
  AK5: seg('AK5', 'Transaction Set Response Trailer', 'Accept/reject status of the transaction set.', [el('717', 'M'), el('718', 'O', { key: 'transactionSetSyntaxErrorCode1' }), el('718', 'O', { key: 'transactionSetSyntaxErrorCode2' }), el('718', 'O', { key: 'transactionSetSyntaxErrorCode3' })]),
  AK9: seg('AK9', 'Functional Group Response Trailer', 'Accept/reject status of the whole functional group plus counts.', [el('715', 'M'), el('97', 'M'), el('123', 'M'), el('2', 'M'), el('716', 'O')]),
};

export function getSegmentSpec(id: string): SegmentSpec | undefined {
  return SEGMENTS[id];
}
