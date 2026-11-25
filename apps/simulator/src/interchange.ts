import { DISTRIBUTOR, FUNCTIONAL_IDS, type Producer, type ProductSeed } from './shared.js';
import { buildInterchangeModel, serializeInterchange } from '@edi/x12';
import { BUILDERS, type SupportedType } from './generators.js';
import type { Scenario } from './scenarios.js';

export interface BuildOptions {
  producer: Producer;
  type: SupportedType;
  controlNumber: number;
  products: ProductSeed[];
  scenario?: Scenario;
  previousControlNumber?: string;
  usage?: 'T' | 'P';
  now?: Date;
}

/** Build one interchange (ISA/GS/ST…SE/GE/IEA) containing a single transaction set. */
export function buildInterchange(opts: BuildOptions): { x12: string; controlNumber: string } {
  const now = opts.now ?? new Date();
  const body = BUILDERS[opts.type](opts.producer, opts.products, now);
  const model = buildInterchangeModel({
    sender: { qualifier: opts.producer.isaQualifier, id: opts.producer.isaId },
    receiver: { qualifier: DISTRIBUTOR.isaQualifier, id: DISTRIBUTOR.isaId },
    controlNumber: opts.controlNumber,
    date: now,
    usage: opts.usage ?? 'T',
    ackRequested: '1',
    groups: [{
      functionalId: FUNCTIONAL_IDS[opts.type],
      senderCode: opts.producer.gsCode,
      receiverCode: DISTRIBUTOR.gsCode,
      controlNumber: opts.controlNumber % 1_000_000,
      transactions: [{ type: opts.type, controlNumber: '0001', body }],
    }],
  });
  const ctx = { producer: opts.producer, type: opts.type, previousControlNumber: opts.previousControlNumber };
  opts.scenario?.apply?.(model, ctx);
  let x12 = serializeInterchange(model);
  if (opts.scenario?.applyText) x12 = opts.scenario.applyText(x12, ctx);
  return { x12, controlNumber: model.isa[13]! };
}
