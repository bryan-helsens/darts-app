import { Link } from 'react-router-dom';
import { formatPlace } from '../../../engine';
import { Card, PageTitle } from '../../components/ui';
import { seasonSettings, useCurrentSeason } from '../../hooks';

function PointsTable() {
  const { season } = useCurrentSeason();
  const s = seasonSettings(season);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-ink text-xs text-zinc-400">
          <tr>
            <th className="py-2 pl-3 text-left font-semibold">Eindplaats op de avond</th>
            <th className="text-center font-semibold">Punten</th>
          </tr>
        </thead>
        <tbody>
          {s.points.table.map((r) => (
            <tr key={r.from} className="border-t border-zinc-100">
              <td className="py-2 pl-3">{r.to === null ? `${r.from}+` : formatPlace(r.from, r.to)}</td>
              <td className="text-center font-semibold text-zinc-950 tabular-nums">{r.points}</td>
            </tr>
          ))}
          <tr className="border-t border-zinc-100 bg-brand-50">
            <td className="py-2 pl-3">Deelname (bovenop de plaatsingspunten)</td>
            <td className="text-center font-semibold text-zinc-950 tabular-nums">+{s.points.participation}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function NewcomersPage() {
  const { season } = useCurrentSeason();
  const s = seasonSettings(season);
  return (
    <div className="max-w-2xl space-y-3">
      <PageTitle>Nieuw? Zo werkt het</PageTitle>
      <Card className="space-y-2 text-sm leading-relaxed text-zinc-700">
        <p>
          Elke <b>derde zaterdag van de maand</b> spelen we een gezellig dartstoernooi in Brasserie ’t Oud Sanatorium in Sijsele. Iedereen is welkom: beginner of
          ervaren speler.
        </p>
        <ol className="space-y-2">
          {[
            <>
              Kom langs en schrijf je in aan de bar <b>vóór {s.registrationCloses.replace(':', 'u')}</b>. De inleg is <b>€{s.entryFee}</b>.
            </>,
            <>Om {s.startTime.replace(':', 'u')} wordt er geloot in poules van (meestal) 4 spelers. Je speelt tegen iedereen uit je poule.</>,
            <>
              Daarna gaan de besten van elke poule naar het <b>A-schema</b>, de anderen naar het <b>B-schema</b>. Zo speelt iedereen de hele avond mee en heb je altijd
              kans op een prijs.
            </>,
            <>We spelen steeldarts, 501 double out. Breng je eigen pijlen mee of leen er een paar.</>,
            <>Je ziet op de tv en op deze site op welk bord je moet spelen. Na elke match vul je samen met je tegenstander de score in.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p>
          Elke avond levert punten op voor de <Link to="/ranking" className="text-brand-700 underline">seizoensranking</Link>, ook als je maar af en toe komt.
        </p>
      </Card>
    </div>
  );
}

export function RulesPage() {
  const { season } = useCurrentSeason();
  const s = seasonSettings(season);
  return (
    <div className="max-w-3xl space-y-3">
      <PageTitle sub={season ? `Seizoen ${season.name}` : undefined}>Reglement</PageTitle>
      <Card className="space-y-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-base font-semibold text-zinc-950">Wedstrijdformat</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>501 double out, steeldarts.</li>
          <li>Poules van bij voorkeur 4 spelers (anders 5, en 3 enkel als het niet anders kan). Iedereen speelt tegen iedereen, best of {s.legs.pool}.</li>
          <li>
            Poulerangschikking: gewonnen matchen → legsaldo → gewonnen legs → onderling resultaat → loting. Bij een gelijke stand op de grens A/B kan de wedstrijdleider
            een barrage van {s.legs.barrage} leg laten spelen.
          </li>
          <li>De top {s.advancePerPool} van elke poule gaat naar het A-schema, de rest naar het B-schema. Byes gaan naar de beste poulewinnaars.</li>
          <li>Spelers uit dezelfde poule komen elkaar niet tegen in de eerste KO-ronde.</li>
          <li>
            A-schema: best of {s.legs.A.early} t.e.m. de kwartfinale, halve finale best of {s.legs.A.semi}, finale best of {s.legs.A.final}. B-schema: best of{' '}
            {s.legs.B.early}, halve finale best of {s.legs.B.semi}, finale best of {s.legs.B.final}.
          </li>
          <li>Wie opgeeft, verliest de resterende matchen reglementair (walk-over).</li>
        </ul>
      </Card>
      <Card className="space-y-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-base font-semibold text-zinc-950">Eindplaatsen en punten</h2>
        <p>
          Het A-schema bepaalt de plaatsen 1 t.e.m. het aantal A-spelers; wie in dezelfde ronde uitgeschakeld wordt, deelt de plaats (3–4, 5–8, …). Het B-schema bepaalt
          de plaatsen daarna: de winnaar van het B-schema eindigt net na de laatste A-plaats.
        </p>
        <PointsTable />
        <p>
          {s.bestOf.enabled
            ? `Voor de seizoensranking tellen de beste ${s.bestOf.count} van de ${s.bestOf.of} avonden (deelnamepunten inbegrepen).`
            : 'Voor de seizoensranking tellen alle avonden mee.'}{' '}
          Bij gelijke stand: aantal overwinningen op een avond → beste resultaat → onderling resultaat → gewonnen legs → loting.
        </p>
      </Card>
      <Card className="space-y-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-base font-semibold text-zinc-950">Privacy</h2>
        <p>
          Van spelers bewaren we enkel de naam, een eventuele bijnaam en (optioneel) een e-mailadres of gsm-nummer. Publiek is enkel de naam zichtbaar. Wil je dat je
          gegevens verwijderd of geanonimiseerd worden? Vraag het aan een organisator.
        </p>
      </Card>
    </div>
  );
}
