import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edi/ui/components/tooltip';
import type { X12Issue } from '@/lib/types';
import { EmptyState } from '@/components/common';

const LEVEL_VARIANT: Record<string, 'destructive' | 'warning' | 'info' | 'muted' | 'outline'> = {
  INTERCHANGE: 'destructive',
  GROUP: 'destructive',
  TRANSACTION: 'warning',
  SEGMENT: 'warning',
  ELEMENT: 'info',
  BUSINESS: 'muted',
};

export function LevelBadge({ level }: { level: string }) {
  return <Badge variant={LEVEL_VARIANT[level] ?? 'outline'}>{level.toLowerCase()}</Badge>;
}

export function AckCodeBadge({ source, code, description }: { source: string; code?: string | null; description?: string | null }) {
  if (!code || source === 'NONE') return <span className="text-muted-foreground text-xs">business rule</span>;
  const badge = (
    <Badge variant="outline" className="font-mono">
      {source} · {code}
    </Badge>
  );
  return description ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  ) : (
    badge
  );
}

type Row = X12Issue & {
  interchange?: { id: string; controlNumber: string; partner?: { name: string } | null } | null;
  transaction?: { id: string; type: string; controlNumber: string } | null;
};

export function IssuesTable({ issues, showContext }: { issues: Row[]; showContext?: boolean }) {
  if (!issues?.length) return <EmptyState icon={CheckCircle2} title="No validation issues" description="Every check passed for this document." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Level</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Ack code</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Bad value</TableHead>
          <TableHead className="min-w-[320px]">Message</TableHead>
          {showContext && <TableHead>Source</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((i, idx) => (
          <TableRow key={i.id ?? idx}>
            <TableCell>
              <LevelBadge level={i.level} />
            </TableCell>
            <TableCell className="font-mono text-xs">{i.code}</TableCell>
            <TableCell>
              <AckCodeBadge source={i.x12CodeSource} code={i.x12Code} description={i.x12CodeDescription} />
            </TableCell>
            <TableCell className="font-mono text-xs">
              {i.segmentId ? (
                <>
                  {i.segmentId}
                  {i.elementPosition ? String(i.elementPosition).padStart(2, '0') : ''}
                  {i.segmentPosition ? <span className="text-muted-foreground"> @{i.segmentPosition}</span> : null}
                  {i.loopId ? <span className="text-muted-foreground"> (loop {i.loopId})</span> : null}
                </>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="max-w-[160px] truncate font-mono text-xs">{i.badValue ?? ''}</TableCell>
            <TableCell className="text-sm whitespace-normal">{i.message}</TableCell>
            {showContext && (
              <TableCell className="text-xs">
                {i.transaction ? (
                  <Link className="text-primary hover:underline" to={`/edi/transactions/${i.transaction.id}`}>
                    {i.transaction.type} #{i.transaction.controlNumber}
                  </Link>
                ) : i.interchange ? (
                  <Link className="text-primary hover:underline" to={`/edi/interchanges/${i.interchange.id}`}>
                    ICN {i.interchange.controlNumber || '—'}
                  </Link>
                ) : null}
                {i.interchange?.partner && <div className="text-muted-foreground">{i.interchange.partner.name}</div>}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
