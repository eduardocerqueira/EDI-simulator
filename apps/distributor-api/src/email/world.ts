import { config } from '../config.js';
import { prisma } from '../db.js';
import type { RecipientWorld, SendEmailPayload } from './resend.js';

/**
 * Simulation only — the producers' side of the conversation. A real producer
 * would read our report and answer from their own mail client; here a fictional
 * EDI coordinator answers some of the reports, a few seconds after opening them.
 * This module is deliberately separate from the integration code (webhooks.ts):
 * the app learns about replies only through `email.received` webhooks.
 */

const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

const FIXES: Record<string, string> = {
  SE_SEGMENT_COUNT_MISMATCH: 'our translator was counting segments before adding the trailer, so SE01 was off',
  ST_SE_CONTROL_MISMATCH: 'ST02 and SE02 were generated from two different counters in our map',
  GE_TRANSACTION_COUNT_MISMATCH: 'GE01 was hard-coded in our envelope template instead of counting the ST/SE pairs',
  ISA_IEA_CONTROL_MISMATCH: 'the IEA02 control number was not updated when we regenerated the envelope',
  DUPLICATE_INTERCHANGE: 'a retry job resent files with the same ISA13; we now allocate a new control number on every resend',
  UNKNOWN_PRODUCT: 'a few new items went out before they were in our 832 catalog; the updated 832 is on its way',
  FOREIGN_PRODUCT: 'some lines carried UPCs from another supplier we pack for; the map now filters them out',
  INVALID_DATE: 'one server had the wrong date format (YYMMDD instead of CCYYMMDD) in the DTM template',
  MANDATORY_SEGMENT_MISSING: 'a recent map change dropped a mandatory segment (CTT); it is restored',
  MANDATORY_ELEMENT_MISSING: 'an optional field in our ERP was mapped to a mandatory X12 element',
  GROUP_VERSION_NOT_SUPPORTED: 'one sender profile was switched to 005010 by mistake; it is back on 004010',
};

export function composeProducerReply(contactName: string, partnerName: string, reportNumber: string, codes: string[], variant?: 'fix' | 'question' | 'ack') {
  const kind = variant ?? pick<'fix' | 'question' | 'ack'>(['fix', 'fix', 'question', 'ack']);
  const known = codes.find((c) => FIXES[c]);
  const sign = `\n\n${contactName}\nEDI coordinator, ${partnerName}`;
  if (kind === 'fix') {
    return (
      `Hi Harvest Hub team,\n\nThanks for report ${reportNumber}. We looked into it: ${known ? FIXES[known] : `the ${codes[0] ?? 'reported'} errors came from a mapping change on our side`}. ` +
      `The fix is deployed and we will resend the affected interchanges today with new control numbers.${sign}`
    );
  }
  if (kind === 'question') {
    return (
      `Hello,\n\nWe received report ${reportNumber}, thank you. Before we resend: for the ${codes[0] ?? 'rejected'} errors, could you confirm whether you need the whole interchange again ` +
      `or only the rejected transaction sets? Our 997 shows some sets as accepted.${sign}`
    );
  }
  return `Hi team,\n\nGot it — report ${reportNumber} has been passed to our IT partner and we'll get back to you by end of week.${sign}`;
}

export const producerWorld: RecipientWorld = {
  async composeReply({ payload }: { id: string; payload: SendEmailPayload }) {
    const to = addr(payload.to[0] ?? '');
    const partner = await prisma.tradingPartner.findFirst({ where: { contactEmail: to } });
    if (!partner?.contactEmail) return null; // test inboxes and unknown recipients never answer
    if (Math.random() >= config.email.simReplyRate) return null;
    const reportNumber = payload.tags?.find((t) => t.name === 'report')?.value ?? 'your report';
    const report = await prisma.producerReport.findFirst({ where: { partnerId: partner.id }, orderBy: { createdAt: 'desc' } });
    const codes = ((report?.summary as { codes?: Array<{ code: string }> } | null)?.codes ?? []).map((c) => c.code);
    return { from: `${partner.contactName} <${partner.contactEmail}>`, text: composeProducerReply(partner.contactName ?? 'EDI team', partner.name, reportNumber, codes) };
  },
};
