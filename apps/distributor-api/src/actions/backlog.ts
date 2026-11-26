import { describeAckCode } from '@edi/x12';
import { nextSequence, prisma } from '../db.js';
import { log } from '../log.js';
import type { Prisma } from '../generated/prisma/index.js';

/**
 * EDI failure backlog: every inbound interchange that was rejected (TA1 R), had
 * transaction sets rejected by the 997 or by business rules, or failed in
 * processing becomes an action item, so nothing a producer sent is silently lost.
 */

export const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'REPORTED', 'PRODUCER_REPLIED'];
export const ITEM_STATUSES = [...OPEN_STATUSES, 'RESOLVED', 'DISMISSED'];
const REJECTED_TX = ['ENVELOPE_REJECTED', 'SYNTAX_REJECTED', 'BUSINESS_REJECTED'];

export const LAYER_OF_LEVEL: Record<string, 'ENVELOPE' | 'SYNTAX' | 'BUSINESS'> = {
  INTERCHANGE: 'ENVELOPE',
  GROUP: 'SYNTAX',
  TRANSACTION: 'SYNTAX',
  SEGMENT: 'SYNTAX',
  ELEMENT: 'SYNTAX',
  BUSINESS: 'BUSINESS',
};
const LAYER_RANK = { SYSTEM: 4, ENVELOPE: 3, SYNTAX: 2, BUSINESS: 1 } as const;
export const fmtNumber = (prefix: 'AI' | 'RPT', n: number) => `${prefix}-${String(n).padStart(6, '0')}`;

export interface HistoryEntry {
  at: string;
  by: string;
  action: string;
  from?: string;
  to?: string;
  note?: string;
}
export const historyEntry = (by: string, action: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({ at: new Date().toISOString(), by, action, ...extra });

/** Create action items for failed interchanges that don't have one yet. Returns how many were created. */
export async function syncActionItems(maxBatches = 5): Promise<number> {
  let created = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const failed = await prisma.interchange.findMany({
      where: {
        actionItem: null,
        processedAt: { not: null },
        partnerId: { not: null },
        OR: [{ status: { in: ['REJECTED', 'PARTIALLY_ACCEPTED', 'ERROR'] } }, { transactions: { some: { status: { in: REJECTED_TX } } } }],
      },
      orderBy: { receivedAt: 'asc' },
      take: 200,
      include: {
        issues: { select: { level: true, code: true } },
        transactions: { select: { status: true, type: true } },
      },
    });
    for (const ic of failed) {
      const failedTx = ic.transactions.filter((t) => REJECTED_TX.includes(t.status));
      const layers = new Set(ic.issues.map((i) => LAYER_OF_LEVEL[i.level] ?? 'SYNTAX'));
      const layer = ic.status === 'ERROR' ? 'SYSTEM' : [...layers].sort((a, b) => LAYER_RANK[b] - LAYER_RANK[a])[0] ?? (ic.ta1AckCode === 'R' ? 'ENVELOPE' : 'SYNTAX');
      const kind = ic.status === 'ERROR' ? 'PROCESSING_ERROR' : ic.status === 'REJECTED' && ic.ta1AckCode === 'R' ? 'INTERCHANGE_REJECTED' : 'TRANSACTIONS_REJECTED';
      const codes = [...new Set(ic.issues.map((i) => i.code))];
      const priority =
        layer === 'SYSTEM' || layer === 'ENVELOPE' ? 'HIGH' : layer === 'SYNTAX' ? 'MEDIUM' : ic.status === 'PARTIALLY_ACCEPTED' && failedTx.length <= 1 ? 'LOW' : 'MEDIUM';
      const types = [...new Set(ic.transactions.map((t) => t.type))].join('/') || 'X12';
      const title =
        kind === 'INTERCHANGE_REJECTED'
          ? `Interchange ${ic.controlNumber || '(no ICN)'} rejected (TA1 R${ic.ta1NoteCode ? ` ${ic.ta1NoteCode}` : ''})${codes[0] ? ` · ${codes[0]}` : ''}`
          : kind === 'PROCESSING_ERROR'
            ? `Interchange ${ic.controlNumber || '(no ICN)'} failed in processing`
            : `${failedTx.length} of ${ic.transactions.length} ${types} transaction set${ic.transactions.length === 1 ? '' : 's'} rejected${codes[0] ? ` · ${codes[0]}` : ''}`;
      const number = await nextSequence('action-item', 1);
      try {
        await prisma.actionItem.create({
          data: {
            number,
            partnerId: ic.partnerId!,
            interchangeId: ic.id,
            kind,
            layer,
            title,
            errorCodes: codes,
            issueCount: ic.issues.length,
            failedTransactions: failedTx.length,
            priority,
            occurredAt: ic.receivedAt,
            history: [historyEntry('system', 'created', { note: `Auto-created: ${kind.toLowerCase().replace(/_/g, ' ')} (${layer.toLowerCase()} layer)` })] as unknown as Prisma.InputJsonValue,
          },
        });
        created++;
      } catch (e) {
        // unique(interchangeId): another instance created it first
        if (!(e as Error).message.includes('Unique constraint')) throw e;
      }
    }
    if (failed.length < 200) break;
  }
  if (created) log.info(`[backlog] created ${created} action item(s) from failed interchanges`);
  return created;
}

/** Everything needed to explain the failures to a producer (used for the e-mail body and the CSV). */
export async function loadItemsForReport(ids: string[]) {
  return prisma.actionItem.findMany({
    where: { id: { in: ids } },
    orderBy: { occurredAt: 'asc' },
    include: {
      interchange: {
        select: {
          id: true,
          controlNumber: true,
          receivedAt: true,
          status: true,
          ta1AckCode: true,
          ta1NoteCode: true,
          fileTransfer: { select: { fileName: true } },
          transactions: { select: { type: true, controlNumber: true, status: true, ackCode: true, ak5Codes: true } },
          issues: {
            orderBy: [{ segmentPosition: 'asc' }],
            select: { level: true, code: true, x12Code: true, x12CodeSource: true, message: true, segmentId: true, segmentPosition: true, elementRef: true, badValue: true, transaction: { select: { type: true, controlNumber: true } } },
          },
        },
      },
    },
  });
}
type ReportItems = Awaited<ReturnType<typeof loadItemsForReport>>;

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(items: ReportItems): string {
  const header = [
    'action_item', 'interchange_control_number', 'received_at', 'file_name', 'interchange_status', 'ta1', 'transaction_type', 'transaction_control_number',
    'layer', 'error_code', 'x12_code_source', 'x12_code', 'x12_code_meaning', 'segment', 'segment_position', 'element', 'bad_value', 'message',
  ];
  const rows: string[][] = [];
  for (const it of items) {
    const ic = it.interchange;
    const issues = ic.issues.length ? ic.issues : [null];
    for (const i of issues) {
      rows.push(
        [
          fmtNumber('AI', it.number), ic.controlNumber, ic.receivedAt.toISOString(), ic.fileTransfer.fileName, ic.status, ic.ta1AckCode ?? '',
          i?.transaction?.type ?? '', i?.transaction?.controlNumber ?? '', i ? (LAYER_OF_LEVEL[i.level] ?? i.level) : it.layer, i?.code ?? '', i?.x12CodeSource ?? '',
          i?.x12Code ?? '', i ? (describeAckCode(i.x12CodeSource, i.x12Code) ?? '') : '', i?.segmentId ?? '', i?.segmentPosition ?? '', i?.elementRef ?? '',
          i?.badValue ?? '', i?.message ?? it.title,
        ].map(csvCell),
      );
    }
  }
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

export function summarize(items: ReportItems) {
  const codes = new Map<string, { code: string; x12Code: string | null; source: string; meaning: string | null; layer: string; interchanges: Set<string>; occurrences: number }>();
  for (const it of items) {
    for (const i of it.interchange.issues) {
      const cur = codes.get(i.code) ?? {
        code: i.code,
        x12Code: i.x12Code,
        source: i.x12CodeSource,
        meaning: describeAckCode(i.x12CodeSource, i.x12Code) ?? null,
        layer: LAYER_OF_LEVEL[i.level] ?? i.level,
        interchanges: new Set<string>(),
        occurrences: 0,
      };
      cur.occurrences++;
      cur.interchanges.add(it.interchangeId);
      codes.set(i.code, cur);
    }
  }
  return {
    interchanges: items.length,
    failedTransactions: items.reduce((n, it) => n + it.failedTransactions, 0),
    issues: items.reduce((n, it) => n + it.issueCount, 0),
    byLayer: Object.fromEntries(['ENVELOPE', 'SYNTAX', 'BUSINESS', 'SYSTEM'].map((l) => [l, items.filter((it) => it.layer === l).length])),
    codes: [...codes.values()].map((c) => ({ ...c, interchanges: c.interchanges.size })).sort((a, b) => b.interchanges - a.interchanges || b.occurrences - a.occurrences),
  };
}

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/** Pre-filled e-mail the admin reviews (and may edit) before sending. */
export function draftEmail(partner: { name: string; isaId: string; contactName: string | null }, items: ReportItems, period: { from: Date; to: Date }) {
  const s = summarize(items);
  const first = partner.contactName?.split(' ')[0] ?? 'team';
  const subject = `EDI exception report · ${s.interchanges} interchange${s.interchanges === 1 ? '' : 's'} need attention · ${partner.name} (${day(period.from)} – ${day(period.to)})`;
  const lines: string[] = [];
  lines.push(`Hello ${first},`, '');
  lines.push(
    `This is an EDI exception report from Harvest Hub Distribution (ISA ZZ:HARVESTHUB) for ${partner.name} (ISA ZZ:${partner.isaId}), covering ${day(period.from)} – ${day(period.to)}.`,
    '',
  );
  lines.push(
    `We could not fully process ${s.interchanges} interchange${s.interchanges === 1 ? '' : 's'} from your mailbox (${s.failedTransactions} transaction set${s.failedTransactions === 1 ? '' : 's'} rejected, ${s.issues} validation issue${s.issues === 1 ? '' : 's'}). The TA1 / 997 acknowledgments are in your from_distributor folder, and every issue is listed in the attached CSV.`,
    '',
  );
  if (s.codes.length) {
    lines.push('Summary by error:');
    for (const c of s.codes.slice(0, 10)) {
      const x12 = c.x12Code ? `${c.source} ${c.x12Code}${c.meaning ? ` "${c.meaning}"` : ''}` : c.layer.toLowerCase();
      lines.push(`  - ${c.code} (${x12}): ${c.interchanges} interchange${c.interchanges === 1 ? '' : 's'}`);
    }
    if (s.codes.length > 10) lines.push(`  - …and ${s.codes.length - 10} more error types (see attachment)`);
    lines.push('');
  }
  lines.push('Interchanges to correct and resend:');
  for (const it of items.slice(0, 20)) {
    const ic = it.interchange;
    const types = [...new Set(ic.transactions.map((t) => t.type))].join('/') || '—';
    const firstIssue = ic.issues[0];
    lines.push(
      `  ${fmtNumber('AI', it.number)}  ICN ${ic.controlNumber || '(none)'} · ${types} · received ${stamp(ic.receivedAt)} · ${ic.fileTransfer.fileName}`,
      `      ${firstIssue ? `${firstIssue.code}${firstIssue.segmentId ? ` at ${firstIssue.segmentId}${firstIssue.segmentPosition ? ` (segment ${firstIssue.segmentPosition})` : ''}` : ''}: ${firstIssue.message}` : it.title}${ic.issues.length > 1 ? ` (+${ic.issues.length - 1} more)` : ''}`,
    );
  }
  if (items.length > 20) lines.push(`  …and ${items.length - 20} more in the attached CSV.`);
  lines.push('');
  lines.push('What we need from you:');
  lines.push('  1. Correct the issues above in your EDI translator / mapping.');
  lines.push('  2. Resend the affected documents with NEW interchange and group control numbers (ISA13 / GS06).');
  lines.push('  3. Reply to this e-mail to confirm, or with any questions. Replies are attached to this report automatically.');
  lines.push('');
  lines.push('Thank you,', 'Harvest Hub EDI Operations', 'edi-support@harvesthub.example');
  return { subject, text: lines.join('\n'), summary: s };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML part built from the (possibly edited) plain text, so both parts always say the same thing. */
export function htmlFromText(text: string, reportNumber: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<div style="background:#14532d;color:#fff;padding:16px 24px;font-weight:700">Harvest Hub · EDI exception report <span style="opacity:.75;font-weight:400">${esc(reportNumber)}</span></div>
<pre style="margin:0;padding:24px;white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.55">${esc(text)}</pre>
<div style="padding:12px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">All companies and data in this message are fictional (EDI Simulator).</div>
</div></body></html>`;
}
