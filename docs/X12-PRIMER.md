# Reading an ANSI X12 envelope — a primer using this project's files

This primer walks through one real file produced by `npm run sim:producers`: an **846 Inventory Inquiry/Advice** from Green Valley Farms to Harvest Hub. Keep `npm run sim:inspect -- <file>` or the distributor's **X12 Inspector** open next to it. Both print every element's name and code meaning.

```
ISA*00*          *00*          *ZZ*GREENVALLEY    *ZZ*HARVESTHUB     *261125*1432*U*00401*000001042*1*T*>~
GS*IB*GREENVALLEY*HARVESTHUB*20261125*1432*1042*X*004010~
ST*846*0001~
BIA*00*DD*INV2611254821*20261125*1432~
DTM*007*20261125~
N1*SU*GREEN VALLEY FARMS*92*PRD001~
N3*1200 VALLEY RD~
N4*SALINAS*CA*93901~
LIN**UP*081007000101*VN*GVF-001~
PID*F*08***ORGANIC ROMAINE LETTUCE~
QTY*33*240*CA~
LIN**UP*081007000132*VN*GVF-002~
PID*F*08***RAINBOW CARROTS~
QTY*33*85*LB~
CTT*2~
SE*14*0001~
GE*1*1042~
IEA*1*000001042~
```

## 1. Delimiters come from the ISA

The ISA segment has a **fixed length of 106 characters**, so a receiver can find the delimiters before it knows anything else:

| Position | Here | Meaning |
|---|---|---|
| 4th character | `*` | **element separator** |
| ISA16 (character 105) | `>` | **component (sub-element) separator** |
| character 106 | `~` | **segment terminator** |

That is why ISA02/ISA04 are 10 spaces and ISA06/ISA08 are padded to 15 characters. Scenario `ISA_BAD_PADDING` breaks this rule, and the result is **TA1 R / 022 Invalid Control Structure**.

## 2. Three nested envelopes

```
ISA ─────────────────────────────── Interchange  (who → who, control # 000001042)
  GS ─────────────────────────────── Functional group  (type IB = 846s, group # 1042)
    ST*846*0001 … SE*14*0001 ──────── Transaction set  (one business document)
  GE*1*1042
IEA*1*000001042
```

Each header has a trailer that **echoes its control number and counts what it contains**. This is how a receiver proves nothing was lost:

| Pair | Must match | Counter | Error if wrong |
|---|---|---|---|
| ISA13 / IEA02 | `000001042` | IEA01 = number of GS groups (1) | TA1 001 / 021 |
| GS06 / GE02 | `1042` | GE01 = number of ST sets (1) | 997 AK9 4 / 5 |
| ST02 / SE02 | `0001` | SE01 = segments from ST to SE inclusive (14) | 997 AK5 3 / 4 |

### ISA, element by element

| Element | Value | Meaning |
|---|---|---|
| ISA01 / ISA03 | `00` / `00` | no authorization / security information |
| ISA05 / ISA06 | `ZZ` / `GREENVALLEY` | sender qualifier (ZZ = mutually defined) and **sender ID** |
| ISA07 / ISA08 | `ZZ` / `HARVESTHUB` | receiver qualifier and **receiver ID** |
| ISA09 / ISA10 | `261125` / `1432` | date YYMMDD / time HHMM |
| ISA11 | `U` | U.S. EDI community of ASC X12 |
| ISA12 | `00401` | envelope version |
| ISA13 | `000001042` | **interchange control number**, unique per sender (`DUPLICATE_INTERCHANGE` → TA1 025) |
| ISA14 | `1` | the sender requests a TA1 acknowledgment |
| ISA15 | `T` | test data (`P` = production) |
| ISA16 | `>` | component separator |

### GS

`GS01=IB` is the functional identifier code (IB → 846, SC → 832, SH → 856, FA → 997). GS02/GS03 are the application sender/receiver codes, GS04/GS05 the date (CCYYMMDD) and time, GS06 the group control number, GS07 `X` the responsible agency, and GS08 `004010` the version/release.

## 3. Segments, elements, qualifiers, loops

- A **segment** is a line: `ID*element1*element2…~`. Its ID tells you which elements to expect ([packages/x12/src/specs/segments.ts](../packages/x12/src/specs/segments.ts)).
- **Elements** are positional. `PID*F*08***ORGANIC ROMAINE LETTUCE` leaves PID03 and PID04 empty, but they are *still present*, so PID05 keeps its position.
- **Qualifiers** give meaning to the next value:
  - `DTM*007*20261125`: 007 = *Effective* date (011 = shipped, 018 = available).
  - `N1*SU*…`: SU = *Supplier* (ST = ship-to, SF = ship-from).
  - `LIN**UP*081007000101*VN*GVF-001`: UP = the UPC follows, VN = the vendor's item number follows.
  - `QTY*33*240*CA`: 33 = *quantity available for sale*, in CA (cases).
- **Loops** are groups of segments that repeat together. The **N1 loop** (N1 party, N3 street, N4 city/state/zip) describes one party. The **LIN loop** (LIN, PID, QTY) describes one item. In the 856, the **HL loop** builds a tree: `HL*1**S` (shipment) ← `HL*2*1*O` (order, parent 1) ← `HL*3*2*I` (item, parent 2).
- **Control totals**: `CTT*2` says there are 2 LIN items. A mismatch is caught as `CTT_COUNT_MISMATCH`.

Segment **order matters**. The structure of each transaction set is in [packages/x12/src/specs/transactions.ts](../packages/x12/src/specs/transactions.ts). For example, the 846 is BIA, DTM*, N1-loop*, LIN-loop (LIN, PID*, QTY+, DTM*), CTT.

## 4. Acknowledgments: how the receiver answers

**TA1** answers about the *envelope* only:

```
TA1*000001042*261125*1432*A*000~      accepted, note 000 = no error
TA1*000001042*261125*1432*R*025~      rejected, 025 = duplicate interchange control number
```

**997** answers about *syntax* inside each group:

```
ST*997*0001~
AK1*IB*1042~                 which group (GS01, GS06)
AK2*846*0001~                which transaction set (ST01, ST02)
AK3*LIN*7*LIN*8~             segment LIN at position 7 in loop LIN has element errors (8)
AK4*2*235*7*XX~              element LIN02 (data element 235) has an invalid code value (7): "XX"
AK5*R*5~                     transaction set rejected — one or more segments in error
AK9*R*1*1*0~                 group rejected — 1 included, 1 received, 0 accepted
SE*8*0001~
```

The 997 says nothing about business meaning. An 846 that references a UPC the distributor has never seen is **syntactically perfect** (`AK5*A`) but gets **business-rejected** by the distributor (scenario `UNKNOWN_PRODUCT`). Real trading partners report that kind of problem separately, for example by email or in an 824 Application Advice.

## 5. From X12 to JSON

The distributor keeps two JSON views of every transaction set. You can see both on the transaction page.

**X12 JSON** keeps the structure and uses the dictionary names, like the course slide:

```json
{
  "type": { "name": "846_INVENTORY_INQUIRY_ADVICE" },
  "stream": "test",
  "sender": { "isaId": "GREENVALLEY" },
  "receiver": { "isaId": "HARVESTHUB" },
  "message": { "transactionSets": [ {
    "transactionSetHeader": [ { "transactionSetIdentifierCode": "846", "transactionSetControlNumber": "0001" } ],
    "beginningSegmentForInventoryInquiryAdvice": [ { "transactionSetPurposeCode": "00", "reportTypeCode": "DD", "referenceIdentification": "INV2611254821", "date": "20261125" } ],
    "itemIdentificationLoop": [ { "itemIdentification": [ { "productServiceIdQualifier": "UP", "productServiceId": "081007000101" } ], "quantityInformation": [ { "quantityQualifier": "33", "quantity": "240" } ] } ]
  } ] }
}
```

**Normalized JSON** contains business objects, which is what the order app receives:

```json
{ "transactionType": "846", "producer": { "code": "PRD001", "name": "Green Valley Farms" },
  "items": [ { "upc": "081007000101", "sku": "GVF-001", "name": "Organic Romaine Lettuce", "price": 38.48, "quantityAvailable": 240 } ] }
```

## 6. Exercises

1. Send one file per error layer and compare the TA1 and 997 that come back:
   `npm run sim:producers -- -n 1 -s ISA_IEA_CONTROL_MISMATCH`, then `-s GE_TRANSACTION_COUNT`, `-s SE_SEGMENT_COUNT`, `-s INVALID_QUALIFIER`, and `-s UNKNOWN_PRODUCT`. Then run `npm run sim:acks`.
2. In the X12 Inspector, paste a valid 856 and change `HL*3*2*I` to `HL*3*9*I`. Which AK4 code do you get?
3. Run `docker compose stop order-api` and send a few files. Watch the deliveries retry with backoff, then go `DEAD`. Start it again and use **Redeliver** on the transaction page.
4. Trace a product: open Inventory → a product → a movement → its 846 transaction → its interchange → the FTP file it came from.
