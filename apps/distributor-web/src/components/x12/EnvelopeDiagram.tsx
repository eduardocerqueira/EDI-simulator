import { Link } from 'react-router-dom';
import { cn } from '@edi/ui/lib/utils';
import { Badge } from '@edi/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edi/ui/components/tooltip';
import { ACK_LABEL, statusLabel, statusVariant, TYPE_NAMES } from '@/lib/status';
import { fmt } from '@/lib/format';

interface Props {
  ic: {
    senderQualifier: string;
    senderId: string;
    receiverQualifier: string;
    receiverId: string;
    controlNumber: string;
    interchangeDate: string;
    interchangeTime: string;
    version: string;
    usageIndicator: string;
    ackRequested: string;
    declaredGroupCount?: string | null;
    trailerControlNumber?: string | null;
    groupCount: number;
    ta1AckCode?: string | null;
    ta1NoteCode?: string | null;
    elementSeparator: string;
    componentSeparator: string;
    segmentTerminator: string;
    groups: Array<{
      id: string;
      functionalId: string;
      senderCode: string;
      receiverCode: string;
      controlNumber: string;
      version: string;
      date: string;
      time: string;
      declaredTransactionCount?: string | null;
      transactionCount: number;
      ackCode: string;
      ak9Codes: string[];
      transactions: Array<{ id: string; type: string; typeName?: string | null; controlNumber: string; status: string; ackCode?: string | null; ak5Codes: string[]; segmentCount: number; itemCount: number; errorCount: number }>;
    }>;
  };
}

function Field({ code, label, value, bad }: { code: string; label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('bg-background/80 min-w-0 rounded-none border px-2 py-1', bad && 'border-destructive bg-destructive/10')}>
          <div className="text-muted-foreground font-mono text-[10px]">{code}</div>
          <div className="truncate font-mono text-xs font-medium">{value || <span className="text-muted-foreground italic">empty</span>}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Rail({ label, className }: { label: string; className: string }) {
  return <div className={cn('flex items-center rounded-none px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase', className)}>{label}</div>;
}

/**
 * Visual "envelope inside an envelope": ISA/IEA wraps GS/GE which wraps ST/SE.
 * Mirrors the classic X12 envelope diagram.
 */
export function EnvelopeDiagram({ ic }: Props) {
  const icnMismatch = !!ic.trailerControlNumber && ic.trailerControlNumber !== ic.controlNumber;
  const groupCountMismatch = !!ic.declaredGroupCount && ic.declaredGroupCount !== String(ic.groupCount);
  return (
    <div className="border-chart-4/50 bg-chart-4/5 rounded-none border-2 p-3">
      <Rail label="ISA · Interchange Control Header — the electronic envelope" className="bg-chart-4/15 text-chart-4" />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Field code="ISA05/06" label="Interchange Sender (qualifier : ID)" value={`${ic.senderQualifier}:${ic.senderId}`} />
        <Field code="ISA07/08" label="Interchange Receiver (qualifier : ID)" value={`${ic.receiverQualifier}:${ic.receiverId}`} />
        <Field code="ISA09/10" label="Interchange date / time (YYMMDD HHMM)" value={`${fmt.x12Date(ic.interchangeDate)} ${fmt.x12Time(ic.interchangeTime)}`} />
        <Field code="ISA12" label="Interchange control version (00401 = 4010)" value={ic.version} />
        <Field code="ISA13" label="Interchange Control Number — must match IEA02" value={ic.controlNumber} bad={icnMismatch} />
        <Field code="ISA14" label="Acknowledgment requested (1 = send TA1)" value={ic.ackRequested === '1' ? '1 · TA1 req.' : ic.ackRequested} />
        <Field code="ISA15" label="Usage indicator: T = test, P = production" value={ic.usageIndicator === 'P' ? 'P · Production' : ic.usageIndicator === 'T' ? 'T · Test' : ic.usageIndicator} />
        <Field code="Delims" label="Element separator / component separator (ISA16) / segment terminator" value={`${ic.elementSeparator} ${ic.componentSeparator} ${ic.segmentTerminator}`} />
      </div>

      <div className="mt-3 space-y-3 pl-3 sm:pl-6">
        {ic.groups.length === 0 && <div className="text-muted-foreground rounded-none border border-dashed p-4 text-sm">No functional groups could be read.</div>}
        {ic.groups.map((g) => {
          const gMismatch = !!g.declaredTransactionCount && g.declaredTransactionCount !== String(g.transactionCount);
          return (
            <div key={g.id} className="border-chart-2/60 bg-chart-2/5 rounded-none border-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Rail label={`GS · Functional Group (${g.functionalId})`} className="bg-chart-2/20 text-[oklch(0.5_0.12_70)] dark:text-chart-2" />
                <Badge variant={statusVariant(g.ackCode)}>997 AK9 {g.ackCode} · {ACK_LABEL[g.ackCode] ?? g.ackCode}</Badge>
                {g.ak9Codes.map((c) => (
                  <Badge key={c} variant="destructive" className="font-mono">AK9 {c}</Badge>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Field code="GS01" label="Functional Identifier Code (SC=832, IB=846, SH=856)" value={g.functionalId} />
                <Field code="GS02" label="Application Sender's Code" value={g.senderCode} />
                <Field code="GS03" label="Application Receiver's Code" value={g.receiverCode} />
                <Field code="GS04/05" label="Group date / time" value={`${fmt.x12Date(g.date)} ${fmt.x12Time(g.time)}`} />
                <Field code="GS06" label="Group Control Number — must match GE02" value={g.controlNumber} />
                <Field code="GS08" label="Version / release (004010)" value={g.version} bad={g.version !== '004010'} />
              </div>
              <div className="mt-3 space-y-2 pl-3 sm:pl-6">
                {g.transactions.map((t) => (
                  <Link
                    key={t.id}
                    to={`/edi/transactions/${t.id}`}
                    className="border-chart-5/50 bg-chart-5/5 hover:bg-chart-5/10 block rounded-none border-2 p-3 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Rail label={`ST · ${t.type} ${t.typeName ?? TYPE_NAMES[t.type] ?? ''}`} className="bg-chart-5/15 text-chart-5" />
                      <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
                      {t.ackCode && <Badge variant={statusVariant(t.ackCode)}>AK5 {t.ackCode}</Badge>}
                      {t.ak5Codes.map((c) => (
                        <Badge key={c} variant="destructive" className="font-mono">AK5 {c}</Badge>
                      ))}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {t.segmentCount} segments · {t.itemCount} items · {t.errorCount} issues →
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Field code="ST01" label="Transaction Set Identifier Code" value={t.type} />
                      <Field code="ST02" label="Transaction Set Control Number — must match SE02" value={t.controlNumber} />
                      <div className="text-muted-foreground col-span-2 flex items-center rounded-none border border-dashed px-2 text-xs">Detail segments (BCT / BIA / BSN, N1 loop, LIN loop, HL loop, CTT…)</div>
                    </div>
                    <div className="mt-2">
                      <Rail label="SE · Transaction Set Trailer" className="bg-chart-5/10 text-chart-5" />
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Rail label="GE · Functional Group Trailer" className="bg-chart-2/15 text-[oklch(0.5_0.12_70)] dark:text-chart-2" />
                <span className={cn('text-xs', gMismatch ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                  GE01 declares {g.declaredTransactionCount ?? '?'} set(s), found {g.transactionCount}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Rail label="IEA · Interchange Control Trailer" className="bg-chart-4/15 text-chart-4" />
        <span className={cn('text-xs', groupCountMismatch ? 'text-destructive font-medium' : 'text-muted-foreground')}>
          IEA01 groups: {ic.declaredGroupCount ?? '?'} (found {ic.groupCount})
        </span>
        <span className={cn('text-xs', icnMismatch ? 'text-destructive font-medium' : 'text-muted-foreground')}>
          · IEA02: {ic.trailerControlNumber ?? 'missing'}
        </span>
        {ic.ta1AckCode && (
          <Badge variant={statusVariant(ic.ta1AckCode)} className="ml-auto">
            TA1 {ic.ta1AckCode} / {ic.ta1NoteCode}
          </Badge>
        )}
      </div>
    </div>
  );
}
