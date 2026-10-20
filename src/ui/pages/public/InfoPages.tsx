import { Link, NavLink } from 'react-router-dom';
import { formatPlace } from '../../../engine';
import { Card, cx, PageTitle } from '../../components/ui';
import { seasonSettings, useCurrentSeason } from '../../hooks';

/** Wisselen tussen "Zo werkt het" en "Reglement" (op gsm delen ze één tab). */
function InfoSwitch() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    cx('flex h-7 items-center rounded-[5px] px-2.5 text-xs font-medium', isActive ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-500 hover:text-zinc-900');
  return (
    <nav className="mb-3 inline-flex rounded-md bg-zinc-200/60 p-0.5">
      <NavLink to="/nieuw" className={cls}>
        Zo werkt het
      </NavLink>
      <NavLink to="/reglement" className={cls}>
        Reglement
      </NavLink>
    </nav>
  );
}

function PointsTable() {
  const { season } = useCurrentSeason();
  const s = seasonSettings(season);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white">
      <table className="w-full text-[13px]">
        <thead className="border-b border-zinc-100 bg-zinc-50/80 text-2xs text-zinc-500">
          <tr>
            <th className="py-1.5 pl-3 text-left font-medium">Eindplaats op de avond</th>
            <th className="text-center font-medium">Punten</th>
          </tr>
        </thead>
        <tbody>
          {s.points.table.map((r) => (
            <tr key={r.from} className="border-t border-zinc-100 first:border-t-0">
              <td className="py-1 pl-3">{r.to === null ? `${r.from}+` : formatPlace(r.from, r.to)}</td>
              <td className="text-center font-semibold text-zinc-950 tabular-nums">{r.points}</td>
            </tr>
          ))}
          <tr className="border-t border-zinc-100 bg-brand-50/60">
            <td className="py-1 pl-3">Deelname (bovenop de plaatsingspunten)</td>
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
      <InfoSwitch />
      <PageTitle>Nieuw? Zo werkt het</PageTitle>
      <Card className="space-y-2 text-[13px] leading-relaxed text-zinc-700">
        <p>
          Elke <b>derde zaterdag van de maand</b> spelen we een gezellig dartstoernooi in Brasserie ’t Oud Sanatorium in Sijsele. Iedereen is welkom: beginner of
          ervaren speler.
        </p>
        <ol className="space-y-2">
          {[
            <>
              Schrijf je vooraf online in (knop “Schrijf je in” op de <Link to="/" className="text-brand-700 underline">startpagina</Link>), of kom gewoon langs en schrijf je in aan de bar. Meld je ter plaatse aan <b>vóór {s.registrationCloses.replace(':', 'u')}</b> en betaal de inleg van <b>€{s.entryFee}</b>.
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
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-2xs font-semibold text-white">{i + 1}</span>
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
      <InfoSwitch />
      <PageTitle sub={season ? `Seizoen ${season.name}` : undefined}>Reglement</PageTitle>
      <Card className="space-y-2 text-[13px] leading-relaxed text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-950">Wedstrijdformat</h2>
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
      <Card className="space-y-2 text-[13px] leading-relaxed text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-950">Eindplaatsen en punten</h2>
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
      <Card className="space-y-2 text-[13px] leading-relaxed text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-950">Elo-rating en loting</h2>
        <p>
          Naast de seizoensranking heeft elke speler een <b>Elo-rating</b>: een getal voor je niveau over alle avonden en seizoenen heen. Iedereen start op{' '}
          {s.elo.start}. Win je van een sterkere tegenstander, dan stijg je veel; verlies je van een zwakkere, dan daal je veel. Walk-overs tellen niet mee. Je eerste{' '}
          {s.elo.newcomerMatches} matchen tellen zwaarder, zodat je rating snel op niveau komt.
        </p>
        <p>
          Bij de loting worden de sterkste spelers gespreid over de poules (en in het schema), standaard op basis van {s.seeding === 'ranking' ? 'de seizoensranking' : s.seeding === 'elo' ? 'de Elo-rating' : 'niets: alles wordt willekeurig geloot'}. Spelers
          zonder rating worden willekeurig verdeeld.
        </p>
      </Card>
      <Card className="space-y-2 text-[13px] leading-relaxed text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-950">Privacy</h2>
        <p>
          Van spelers bewaren we enkel de naam, een eventuele bijnaam en (optioneel) een e-mailadres of gsm-nummer. Publiek is enkel de naam zichtbaar. Wil je dat je
          gegevens verwijderd of geanonimiseerd worden? Vraag het aan een organisator.
        </p>
      </Card>
    </div>
  );
}
