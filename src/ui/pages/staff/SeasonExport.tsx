import { useState } from 'react';
import { fetchContacts, fetchPlayers, fetchSeasonTables } from '../../../data/api';
import { useAuth } from '../../../data/auth';
import { buildSeasonBackup, matchesCsv, rankingCsv, resultsCsv } from '../../../data/exports';
import { usePlayerDirectory } from '../../../data/queries';
import type { SeasonRow } from '../../../data/rows';
import { fileSlug } from '../../../lib/csv';
import { todayInBrussels } from '../../../lib/time';
import { Button, Card, ErrorBox, Icon, SectionTitle } from '../../components/ui';
import { downloadFile } from '../../export/download';
import { seasonSettings, useSeasonRanking } from '../../hooks';

const CSV = 'text/csv;charset=utf-8';

/** Blok "Exporteren" op de seizoenspagina: CSV's voor Excel en (admin) een volledige back-up. */
export function SeasonExport({ season }: { season: SeasonRow }) {
  const { isAdmin } = useAuth();
  const { rows, data, isLoading } = useSeasonRanking(season);
  const { name } = usePlayerDirectory();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const slug = fileSlug(season.name);
  const ready = !isLoading && data !== undefined;

  const backup = async () => {
    setBusy(true);
    setError(null);
    try {
      const [tables, players, contacts] = await Promise.all([fetchSeasonTables(season.id), fetchPlayers(), fetchContacts()]);
      const json = buildSeasonBackup({ season, tables, players, contacts, exportedAt: new Date().toISOString() });
      downloadFile(`sanapolis-backup-${slug}-${todayInBrussels()}.json`, JSON.stringify(json, null, 2), 'application/json');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const item = (label: string, onClick: () => void, disabled = !ready) => (
    <Button variant="secondary" block onClick={onClick} disabled={disabled}>
      <Icon name="download" className="h-3.5 w-3.5 text-zinc-500" />
      {label}
    </Button>
  );

  return (
    <>
      <SectionTitle>Exporteren</SectionTitle>
      <Card>
        <div className="grid gap-2 sm:grid-cols-2">
          {item('Ranking (CSV)', () => downloadFile(`sanapolis-ranking-${slug}.csv`, rankingCsv(rows, name), CSV))}
          {item('Uitslagen per avond (CSV)', () =>
            data && downloadFile(`sanapolis-uitslagen-${slug}.csv`, resultsCsv({ events: data.events, results: data.results, settings: seasonSettings(season), name }), CSV),
          )}
          {item('Matchen (CSV)', () => data && downloadFile(`sanapolis-matchen-${slug}.csv`, matchesCsv({ events: data.events, matches: data.matches, stats: data.stats, name }), CSV))}
          {isAdmin && item(busy ? 'Back-up maken…' : 'Volledige back-up (JSON)', () => void backup(), busy)}
        </div>
        {error !== null && (
          <div className="mt-2">
            <ErrorBox error={error} />
          </div>
        )}
        <p className="mt-2 text-2xs text-zinc-500">
          De CSV-bestanden openen meteen in Excel.
          {isAdmin && ' De back-up bevat alle gegevens van dit seizoen, ook e-mailadressen en telefoonnummers: bewaar ze veilig.'}
        </p>
      </Card>
    </>
  );
}
