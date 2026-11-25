import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRIBUTOR, PRODUCERS, productsOf } from '@edi/shared';
import { analyzeInterchange, build997Interchange, buildTA1Interchange, mapTransaction, flattenIssues } from '@edi/x12';
import { buildInterchange } from './interchange.js';
import { SCENARIOS } from './scenarios.js';

const producer = PRODUCERS[0]!;
const ctx = {
  receiverIds: [DISTRIBUTOR.isaId],
  knownSenderIds: PRODUCERS.map((p) => p.isaId),
  isDuplicate: (_s: string, icn: string) => icn === '000000001',
};

for (const type of ['832', '846', '856'] as const) {
  test(`valid ${type} is fully accepted and maps`, () => {
    const { x12 } = buildInterchange({ producer, type, controlNumber: 1000, products: productsOf(producer.code) });
    const r = analyzeInterchange(x12, ctx);
    assert.equal(r.ta1.ackCode, 'A', JSON.stringify(r.issues));
    const t = r.groups[0]!.transactions[0]!;
    assert.deepEqual(t.issues, []);
    assert.equal(r.groups[0]!.ackCode, 'A');
    const doc = mapTransaction(type, r.parsed!.groups[0]!.transactions[0]!.body);
    assert.ok(doc);
    const ack = build997Interchange(r, { sender: { qualifier: 'ZZ', id: DISTRIBUTOR.isaId }, receiver: { qualifier: 'ZZ', id: producer.isaId }, interchangeControlNumber: 5, groupControlNumberStart: 5 });
    const ackResult = analyzeInterchange(ack, { receiverIds: [producer.isaId] });
    assert.equal(ackResult.ta1.ackCode, 'A', JSON.stringify(ackResult.issues));
    assert.equal(ackResult.groups[0]!.transactions[0]!.ackCode, 'A', JSON.stringify(ackResult.groups[0]!.transactions[0]!.issues));
  });
}

for (const s of SCENARIOS) {
  const type = (s.types?.[0] ?? '846') as '832' | '846' | '856';
  test(`scenario ${s.id} → ${s.expected}`, () => {
    const { x12 } = buildInterchange({ producer, type, controlNumber: 2000, products: productsOf(producer.code), scenario: s, previousControlNumber: '000000001' });
    const r = analyzeInterchange(x12, ctx);
    const issues = flattenIssues(r);
    const tokens = s.expected.split(' ');
    const kind = tokens[0];
    const code = tokens.at(-1);
    if (s.layer === 'business') {
      assert.equal(r.ta1.ackCode, 'A');
      assert.equal(r.groups[0]!.transactions[0]!.ackCode, 'A', JSON.stringify(issues));
      return;
    }
    assert.ok(issues.length > 0, 'expected at least one issue');
    if (kind === 'TA1') {
      assert.equal(r.ta1.ackCode, 'R');
      assert.ok(r.issues.some((i) => i.x12Code === code), `TA1 codes: ${r.issues.map((i) => i.x12Code).join(',')}`);
      const ta1 = buildTA1Interchange(r, { sender: { qualifier: 'ZZ', id: DISTRIBUTOR.isaId }, receiver: { qualifier: 'ZZ', id: producer.isaId }, interchangeControlNumber: 9 });
      assert.match(ta1, /TA1\*/);
    } else {
      assert.equal(r.ta1.ackCode, 'A', JSON.stringify(r.issues));
      const src = s.expected.split(' ')[1]!; // AK9/AK5/AK3/AK4
      assert.ok(issues.some((i) => i.x12CodeSource === src && i.x12Code === code), `${src} codes: ${issues.map((i) => `${i.x12CodeSource}:${i.x12Code}`).join(',')}`);
      assert.notEqual(r.groups[0]!.ackCode, 'A');
    }
  });
}
