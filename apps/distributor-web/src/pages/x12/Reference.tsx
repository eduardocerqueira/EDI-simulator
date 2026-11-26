import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Input } from '@edi/ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { ErrorState, LoadingPage, Mono, PageHeader } from '@/components/common';
import { LAYER_STYLE } from '@/components/x12/SegmentViewer';

interface ElementSpec { ref: string; name: string; type: string; min: number; max: number; codes?: Record<string, string>; usage: string; key: string }
interface SegmentSpec { id: string; name: string; key: string; purpose: string; elements: ElementSpec[] }
type StructureNode = { kind: 'segment'; id: string; usage: string; max: number } | { kind: 'loop'; id: string; name: string; key: string; usage: string; max: number; children: StructureNode[] };
interface Reference {
  segments: Record<string, SegmentSpec>;
  transactions: Record<string, { id: string; name: string; key: string; functionalId: string; description: string; structure: StructureNode[] }>;
  codes: Record<string, Record<string, string>>;
  distributor: Record<string, string>;
  partners: Array<{ code: string; name: string; isaId: string; ftpUser: string; specialty: string }>;
}

const layerOf = (id: string) => (['ISA', 'IEA', 'TA1'].includes(id) ? 'interchange' : ['GS', 'GE'].includes(id) ? 'group' : ['ST', 'SE'].includes(id) ? 'transaction' : 'detail');

function Structure({ nodes, segments, depth = 0 }: { nodes: StructureNode[]; segments: Record<string, SegmentSpec>; depth?: number }) {
  return (
    <div className={cn('space-y-1', depth > 0 && 'border-chart-5/40 ml-4 border-l-2 pl-3')}>
      {nodes.map((n, i) =>
        n.kind === 'segment' ? (
          <div key={i} className="flex items-center gap-3 text-sm">
            <Mono className="w-10 font-semibold">{n.id}</Mono>
            <span>{segments[n.id]?.name}</span>
            <Badge variant={n.usage === 'M' ? 'default' : 'muted'} className="ml-auto">{n.usage === 'M' ? 'Mandatory' : 'Optional'}</Badge>
            <span className="text-muted-foreground w-16 text-right text-xs">max {n.max >= 99999 ? '>1' : n.max}</span>
          </div>
        ) : (
          <div key={i} className="py-1">
            <div className="text-chart-5 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              Loop {n.id} — {n.name} <Badge variant="outline">{n.usage === 'M' ? 'mandatory' : 'optional'} · repeat {n.max >= 99999 ? 'many' : n.max}</Badge>
            </div>
            <Structure nodes={n.children} segments={segments} depth={depth + 1} />
          </div>
        ),
      )}
    </div>
  );
}

const CODE_TITLES: Record<string, string> = {
  TA1: 'TA1 I18 — Interchange note codes (envelope)',
  AK9: 'AK9 716 — Functional group syntax error codes',
  AK5: 'AK5 718 — Transaction set syntax error codes',
  AK3: 'AK3 720 — Segment syntax error codes',
  AK4: 'AK4 723 — Data element syntax error codes',
  ACK: 'AK5 717 / AK9 715 — Acknowledgment codes',
};

export function ReferencePage() {
  const q = useQuery({ queryKey: ['x12-reference'], queryFn: () => api<Reference>('/x12/reference'), staleTime: Infinity });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('ISA');
  const segs = useMemo(() => Object.values(q.data?.segments ?? {}), [q.data]);
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const ref = q.data!;
  const filtered = segs.filter((s) => !search || `${s.id} ${s.name}`.toLowerCase().includes(search.toLowerCase()));
  const seg = ref.segments[selected];

  return (
    <>
      <PageHeader title="X12 Reference" description="The implementation guide this simulator uses (ASC X12 004010, simplified): transaction set structures, the segment & element dictionary, and acknowledgment code lists." />
      <Tabs defaultValue="concepts">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="concepts">Concepts</TabsTrigger>
          <TabsTrigger value="transactions">Transaction sets</TabsTrigger>
          <TabsTrigger value="segments">Segment dictionary</TabsTrigger>
          <TabsTrigger value="codes">Ack codes</TabsTrigger>
          <TabsTrigger value="partners">Trading partners</TabsTrigger>
        </TabsList>

        <TabsContent value="concepts" className="mt-4 grid gap-4 lg:grid-cols-2">
          {[
            ['Interchange (ISA/IEA)', 'The outer "electronic envelope". ISA is fixed-length (106 chars) and defines the delimiters: char 4 = element separator, ISA16 = component separator, the next char = segment terminator. ISA06/ISA08 identify sender and receiver; ISA13 is the interchange control number and must equal IEA02. Problems here are answered with a TA1.'],
            ['Functional group (GS/GE)', 'Groups transaction sets of the same kind. GS01 says what is inside (SC = 832, IB = 846, SH = 856, FA = 997). GS06 must equal GE02 and GE01 counts the ST/SE pairs. Reported in the 997 AK9 segment.'],
            ['Transaction set (ST/SE)', 'One business document. ST01 = type (832, 846, 856), ST02 = control number that must equal SE02. SE01 counts every segment from ST to SE inclusive. Reported in AK2/AK5.'],
            ['Segments & elements', 'A segment is a line starting with an ID (BIA, LIN, QTY…) terminated by "~". Elements are separated by "*" and referenced by position, e.g. LIN03. Empty elements are kept as "**" so positions do not shift. Errors are reported with AK3 (segment) and AK4 (element).'],
            ['Qualifiers', 'Many elements are qualified by the previous one: in LIN*UP*012345678905, "UP" says the next value is a UPC; in DTM*011*20261125, "011" means "shipped date"; in N1*SU, "SU" means supplier.'],
            ['Loops', 'Repeating groups of segments. The N1 loop (N1, N3, N4) describes a party; the LIN loop describes an item; the 856 HL loop builds a Shipment → Order → Item hierarchy using HL01 (id) and HL02 (parent id).'],
          ].map(([t, d]) => (
            <Card key={t} className="gap-2 py-4">
              <CardHeader className="px-4"><CardTitle className="text-sm">{t}</CardTitle></CardHeader>
              <CardContent className="text-muted-foreground px-4 text-sm leading-relaxed">{d}</CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="transactions" className="mt-4 grid gap-4 xl:grid-cols-2">
          {Object.values(ref.transactions).map((t) => (
            <Card key={t.id} className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mono className="text-base">{t.id}</Mono> {t.name} <Badge variant="outline" className="font-mono">GS01 = {t.functionalId}</Badge>
                </CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-3 text-sm"><Mono className="text-chart-5 w-10 font-semibold">ST</Mono> Transaction Set Header</div>
                <Structure nodes={t.structure} segments={ref.segments} />
                <div className="flex items-center gap-3 text-sm"><Mono className="text-chart-5 w-10 font-semibold">SE</Mono> Transaction Set Trailer</div>
                <div className="text-muted-foreground pt-2 font-mono text-[11px]">JSON type: {t.key}</div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="segments" className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="gap-2 py-3">
            <CardContent className="px-3">
              <div className="relative mb-2">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input className="pl-8" placeholder="Find segment" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="max-h-[560px] space-y-0.5 overflow-y-auto">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    className={cn('flex w-full cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-left text-sm', selected === s.id ? 'bg-accent' : 'hover:bg-muted')}
                  >
                    <span className={cn('h-4 w-1 rounded-none', LAYER_STYLE[layerOf(s.id)]!.bar)} />
                    <Mono className="w-9 font-semibold">{s.id}</Mono>
                    <span className="text-muted-foreground truncate text-xs">{s.name}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          {seg && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mono className="text-lg">{seg.id}</Mono> {seg.name}</CardTitle>
                <CardDescription>{seg.purpose}</CardDescription>
                <div className="text-muted-foreground font-mono text-xs">JSON key: {seg.key}</div>
              </CardHeader>
              <CardContent className="px-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pos</TableHead>
                      <TableHead>Ref</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Req</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Length</TableHead>
                      <TableHead className="min-w-[260px]">Codes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seg.elements.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs font-medium">{seg.id}{String(i + 1).padStart(2, '0')}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{e.ref}</TableCell>
                        <TableCell className="whitespace-normal">
                          <div>{e.name}</div>
                          <div className="text-muted-foreground font-mono text-[11px]">{e.key}</div>
                        </TableCell>
                        <TableCell><Badge variant={e.usage === 'M' ? 'default' : 'muted'}>{e.usage}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{e.type}</TableCell>
                        <TableCell className="font-mono text-xs">{e.min}/{e.max}</TableCell>
                        <TableCell className="text-xs whitespace-normal">
                          {e.codes ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(e.codes).map(([c, d]) => (
                                <span key={c} className="bg-muted rounded-none px-1.5 py-0.5" title={d}>
                                  <b className="font-mono">{c}</b> <span className="text-muted-foreground">{d}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-muted-foreground mt-3 text-xs">Types: AN = alphanumeric, ID = code from a list, N0 = integer, R = decimal, DT = date, TM = time. Req: M = mandatory, O = optional, X = conditional.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="codes" className="mt-4 grid gap-4 xl:grid-cols-2">
          {Object.entries(ref.codes).map(([k, codes]) => (
            <Card key={k} className="gap-2">
              <CardHeader><CardTitle className="text-sm">{CODE_TITLES[k] ?? k}</CardTitle></CardHeader>
              <CardContent className="px-3">
                <Table>
                  <TableBody>
                    {Object.entries(codes).map(([c, d]) => (
                      <TableRow key={c}>
                        <TableCell className="w-16 font-mono font-semibold">{c}</TableCell>
                        <TableCell className="text-sm whitespace-normal">{d}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="partners" className="mt-4">
          <Card className="gap-2">
            <CardHeader>
              <CardTitle>Who is who</CardTitle>
              <CardDescription>
                Distributor: <Mono>{ref.distributor.isaQualifier}:{ref.distributor.isaId}</Mono> ({ref.distributor.name}), N1 code <Mono>{ref.distributor.n1Code}</Mono>
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producer</TableHead>
                    <TableHead>N1 code</TableHead>
                    <TableHead>ISA06 / GS02</TableHead>
                    <TableHead>FTP user</TableHead>
                    <TableHead>Mailbox</TableHead>
                    <TableHead>Specialty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ref.partners.map((p) => (
                    <TableRow key={p.code}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="font-mono text-xs">{p.isaId}</TableCell>
                      <TableCell className="font-mono text-xs">{p.ftpUser}</TableCell>
                      <TableCell className="font-mono text-xs">/{p.ftpUser}/to_distributor</TableCell>
                      <TableCell>{p.specialty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
