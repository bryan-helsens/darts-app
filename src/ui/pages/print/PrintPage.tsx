import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { STAGE_NAMES, type BracketStage, type Match } from '../../../engine';
import { buildEventView, SCHEMA_STAGES, type EventView } from '../../../data/eventView';
import { useEventBundle, usePlayerDirectory } from '../../../data/queries';
import { formatLongDate } from '../../../lib/time';
import { bracketLayout } from '../../components/bracketLayout';
import { Button, ErrorBox, Icon, Spinner } from '../../components/ui';

type NameFn = (id: string | null | undefined) => string;

/**
 * Printversies (papieren noodplan): poulebladen, KO-schema's en lege
 * wedstrijdbladen. "Afdrukken" → kies "Opslaan als PDF" om een PDF te maken.
 */
export function PrintPage() {
  const { eventId } = useParams();
  const bundle = useEventBundle(eventId);
  const directory = usePlayerDirectory();
  const view = useMemo(() => (bundle.data ? buildEventView(bundle.data) : null), [bundle.data]);
  const [parts, setParts] = useState({ pools: true, brackets: true, sheets: false });

  if (bundle.isLoading) return <Spinner />;
  if (!view) return <ErrorBox error={bundle.error ?? 'Speelavond niet gevonden.'} />;
  const name = directory.name;
  const open = view.matches.filter((m) => !m.winner && m.player1 && m.player2);

  return (
    <div className="mx-auto max-w-4xl bg-white p-4 print:max-w-none print:p-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { .page-break { break-before: page; } }`}</style>
      <div className="no-print mb-4 space-y-2 rounded-lg bg-ink p-3 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/beheer/avond/${view.event.id}`} className="text-xs text-zinc-300 hover:text-white">
            ← terug
          </Link>
          <Button size="sm" onClick={() => window.print()}>
            <Icon name="print" />
            Afdrukken / PDF
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
          {(
            [
              ...(view.format === 'poules_ab' ? ([['pools', 'Poulebladen']] as const) : []),
              ['brackets', view.format === 'poules_ab' ? 'A- en B-schema' : 'Schema'],
              ['sheets', `Wedstrijdbladen (${open.length} open matchen)`],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={parts[key]} onChange={(e) => setParts((p) => ({ ...p, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>
        <p className="text-2xs text-zinc-400">Tip: druk de poulebladen af meteen na de start. Valt het internet uit, dan kan de avond op papier verder.</p>
      </div>

      <h1 className="text-xl font-bold">Sanapolis Darts · {formatLongDate(view.event.event_date)}</h1>
      {parts.pools && view.format === 'poules_ab' && <PoolSheets view={view} name={name} />}
      {parts.brackets && (view.format !== 'poules_ab' || view.event.knockout) && (
        <div className="page-break">
          {SCHEMA_STAGES[view.format].map((stage) => (
            <PrintBracket key={stage} view={view} stage={stage} name={name} />
          ))}
        </div>
      )}
      {parts.sheets && <MatchSheets view={view} matches={open} name={name} />}
    </div>
  );
}

const box = 'inline-block h-6 w-8 border border-black align-middle';

function PoolSheets({ view, name }: { view: EventView; name: NameFn }) {
  return (
    <div className="grid grid-cols-1 gap-6 print:grid-cols-2">
      {view.pools.map((pool) => {
        const ms = view.matches.filter((m) => m.stage === 'pool' && m.poolId === pool.id).sort((a, b) => a.round - b.round || a.position - b.position);
        return (
          <section key={pool.id} className="break-inside-avoid border border-black p-3 text-sm">
            <h2 className="mb-2 text-lg font-bold">
              {pool.label} <span className="text-sm font-normal">(best of {ms[0]?.bestOf})</span>
            </h2>
            <table className="mb-3 w-full border-collapse">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="w-6">#</th>
                  <th>Speler</th>
                  <th className="w-10 text-center">W</th>
                  <th className="w-14 text-center">Legs</th>
                  <th className="w-10 text-center">Plaats</th>
                </tr>
              </thead>
              <tbody>
                {pool.playerIds.map((id, i) => (
                  <tr key={id} className="border-b border-zinc-300">
                    <td>{i + 1}</td>
                    <td>{name(id)}</td>
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full border-collapse">
              <tbody>
                {ms.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-300">
                    <td className="w-8 py-1 text-xs">R{m.round}</td>
                    <td className="text-right">{name(m.player1)}</td>
                    <td className="w-24 text-center">{m.winner ? `${m.legs1} – ${m.legs2}` : <><span className={box} /> – <span className={box} /></>}</td>
                    <td>{name(m.player2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function PrintBracket({ view, stage, name }: { view: EventView; stage: BracketStage; name: NameFn }) {
  const columns = bracketLayout(stage, view.matches);
  if (columns.length === 0) return null;
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-2 text-lg font-bold">{STAGE_NAMES[stage]}</h2>
      <div className="flex gap-2 text-xs">
        {columns.map((col) => {
          return (
            <div key={col.round} className="flex w-36 flex-col">
              <div className="mb-1 text-center font-semibold">
                {col.name} (bo{col.bestOf})
              </div>
              <div className="flex flex-1 flex-col justify-around gap-1">
                {col.slots.map((m, idx) =>
                  m === null ? (
                    <div key={`bye-${idx}`} className="py-2 text-center text-zinc-400">
                      bye
                    </div>
                  ) : (
                  <div key={m.id} className="border border-black">
                    {([m.player1, m.player2] as const).map((p, i) => (
                      <div key={i} className="flex justify-between gap-1 border-b border-zinc-300 px-1 py-0.5 last:border-b-0">
                        <span className="truncate">{p ? name(p) : '……………'}</span>
                        <span>{(i === 0 ? m.legs1 : m.legs2) ?? ''}</span>
                      </div>
                    ))}
                  </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MatchSheets({ view, matches, name }: { view: EventView; matches: Match[]; name: NameFn }) {
  return (
    <div className="page-break grid grid-cols-1 gap-3 print:grid-cols-2">
      {matches.map((m) => {
        const legs = m.bestOf;
        return (
          <section key={m.id} className="break-inside-avoid border border-black p-2 text-sm">
            <div className="flex justify-between font-semibold">
              <span>{m.stage === 'pool' ? view.pools.find((p) => p.id === m.poolId)?.label : `${m.stage}-schema`}</span>
              <span>
                best of {legs} · Bord: ____
              </span>
            </div>
            <table className="mt-2 w-full border-collapse">
              <tbody>
                {[m.player1, m.player2].map((p, i) => (
                  <tr key={i}>
                    <td className="py-1 font-semibold">{name(p)}</td>
                    <td className="text-right">
                      {Array.from({ length: legs }, (_, j) => (
                        <span key={j} className="ml-1 inline-block h-5 w-5 border border-black" />
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-xs">180’s: ____________ · Hoogste uitgooi: ______ · Schrijver: ____________</div>
          </section>
        );
      })}
    </div>
  );
}
