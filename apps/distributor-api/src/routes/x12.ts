import type { FastifyInstance } from 'fastify';
import { PRODUCERS, DISTRIBUTOR } from '@edi/shared';
import {
  ACK_STATUS_CODES, AK3_ERROR_CODES, AK4_ERROR_CODES, AK5_ERROR_CODES, AK9_ERROR_CODES, SEGMENTS, TA1_NOTE_CODES, TRANSACTIONS,
  analyzeInterchange, inspectionReport, mapTransaction, transactionDocument,
} from '@edi/x12';

/** Learning tools: paste any X12 and see it annotated, validated and converted. */
export async function x12Routes(app: FastifyInstance) {
  app.post('/x12/inspect', async (req, reply) => {
    const { content } = (req.body ?? {}) as { content?: string };
    if (!content?.trim()) return reply.code(400).send({ error: 'content is required' });
    const result = analyzeInterchange(content, { receiverIds: [DISTRIBUTOR.isaId, ...PRODUCERS.map((p) => p.isaId)] });
    const report = inspectionReport(result);
    const documents = result.groups.flatMap((g) =>
      g.transactions.map((t) => ({
        groupIndex: g.index,
        transactionIndex: t.index,
        type: t.type,
        controlNumber: t.controlNumber,
        ackCode: t.ackCode,
        x12Json: transactionDocument(result, g, t),
        normalized: t.ackCode === 'A' && result.parsed ? mapTransaction(t.type, result.parsed.groups[g.index]!.transactions[t.index]!.body) ?? null : null,
      })),
    );
    return { ...report, documents };
  });

  app.get('/x12/reference', async () => ({
    segments: SEGMENTS,
    transactions: TRANSACTIONS,
    codes: { TA1: TA1_NOTE_CODES, AK9: AK9_ERROR_CODES, AK5: AK5_ERROR_CODES, AK3: AK3_ERROR_CODES, AK4: AK4_ERROR_CODES, ACK: ACK_STATUS_CODES },
    distributor: DISTRIBUTOR,
    partners: PRODUCERS,
  }));
}
