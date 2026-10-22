import { useMemo, useState } from 'react';
import { roundName, STAGE_NAMES, stageRoundName, type Match } from '../../../engine';
import type { EventView } from '../../../data/eventView';
import { usePendingScores } from '../../../data/outbox';
import { normalizeName } from '../../../lib/names';
import { MatchTile, TileGrid } from '../../components/darts';
import { Badge, Empty, LiveBadge, SearchInput, Segmented } from '../../components/ui';
import { MatchModal } from './MatchModal';

type NameFn = (id: string | null | undefined) => string;
type Filter = 'open' | 'gespeeld' | 'alle';

const STAGE_ORDER: Record<Match['stage'], number> = { pool: 0, barrage: 1, A: 2, B: 3, W: 4, L: 5, GF: 6, M: 7, P: 8 };

/**
 * Alle matchen van de avond, om achteraf een score in te voeren of te
 * corrigeren (ook voor matchen die nooit op een bord stonden of op papier
 * gespeeld werden).
 */
export function MatchesPanel({ view, name }: { view: EventView; name: NameFn }) {
  const [filter, setFilter] = useState<Filter>(view.event.status === 'afgelopen' ? 'alle' : 'open');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const pending = usePendingScores(view.event.id);
  const liveBoard = new Map((view.replay?.boards ?? []).filter((b) => b.matchId).map((b) => [b.matchId as string, b.board]));

  const groups = useMemo(() => {
    const q = normalizeName(query);
    const rounds = new Map<string, number>();
    for (const m of view.matches) rounds.set(m.stage, Math.max(rounds.get(m.stage) ?? 0, m.round));
    const list = view.matches
      .filter((m) => {
        if (filter === 'open' && (m.winner !== null || !m.player1 || !m.player2)) return false;
        if (filter === 'gespeeld' && m.winner === null) return false;
        if (!q) return true;
        return q.split(' ').every((part) => normalizeName(`${name(m.player1)} ${name(m.player2)}`).includes(part));
      })
      .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || (a.poolId ?? '').localeCompare(b.poolId ?? '', 'nl', { numeric: true }) || a.round - b.round || a.position - b.position);
    const out: Array<{ key: string; title: string; matches: Array<{ m: Match; label: string }> }> = [];
    for (const m of list) {
      const key = m.stage === 'pool' ? `pool:${m.poolId}` : m.stage;
      const title = m.stage === 'pool' ? (view.pools.find((p) => p.id === m.poolId)?.label ?? 'Poule') : m.stage === 'barrage' ? 'Barrages' : STAGE_NAMES[m.stage];
      const stageRounds = rounds.get(m.stage) ?? m.round;
      const label =
        m.stage === 'A' || m.stage === 'B' || m.stage === 'M'
          ? roundName(m.round, stageRounds)
          : m.stage === 'pool'
            ? `Ronde ${m.round}`
            : m.stage === 'barrage' || m.stage === 'GF'
              ? ''
              : stageRoundName(m.stage, m.round, stageRounds);
      if (out.at(-1)?.key !== key) out.push({ key, title, matches: [] });
      out.at(-1)?.matches.push({ m, label });
    }
    return out;
  }, [view.matches, view.pools, filter, query, name]);

  const selectedMatch = selected ? view.byCode.get(selected) : undefined;
  const counts = {
    open: view.matches.filter((m) => m.winner === null && m.player1 && m.player2).length,
    gespeeld: view.matches.filter((m) => m.winner !== null).length,
    alle: view.matches.length,
  };

  if (view.matches.length === 0) return <Empty>Er zijn nog geen matchen: start eerst het toernooi.</Empty>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={(['open', 'gespeeld', 'alle'] as const).map((f) => ({
            id: f,
            label: (
              <>
                {f === 'open' ? 'Te spelen' : f === 'gespeeld' ? 'Gespeeld' : 'Alle'} <span className="font-normal text-zinc-400">{counts[f]}</span>
              </>
            ),
          }))}
        />
        <SearchInput className="min-w-40 flex-1" placeholder="Zoek op speler…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <p className="text-2xs text-zinc-500">Tik op een match om de score in te voeren of te corrigeren, ook als ze niet op een bord stond.</p>

      {groups.length === 0 ? (
        <Empty>Geen matchen gevonden.</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-1.5 text-2xs font-semibold tracking-wider text-zinc-500 uppercase">{g.title}</h3>
            <TileGrid>
              {g.matches.map(({ m, label }) => {
                const p = pending.get(m.id);
                const board = liveBoard.get(m.id);
                return (
                  <MatchTile
                    key={m.id}
                    m={m}
                    name={name}
                    title={label}
                    pending={p}
                    extra={p ? <Badge tone="amber">sync…</Badge> : board !== undefined ? <LiveBadge>bord {board}</LiveBadge> : !m.player1 || !m.player2 ? <Badge>wacht</Badge> : null}
                    onClick={() => setSelected(m.id)}
                  />
                );
              })}
            </TileGrid>
          </section>
        ))
      )}

      {selectedMatch && <MatchModal view={view} match={selectedMatch} name={name} board={liveBoard.get(selectedMatch.id)} onClose={() => setSelected(null)} />}
    </div>
  );
}
