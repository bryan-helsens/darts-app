/** Standaardinstellingen. Alles is per seizoen (en deels per avond) aanpasbaar. */

export interface BracketLegs {
  /** Eerste KO-rondes t.e.m. kwartfinale. */
  early: number;
  semi: number;
  final: number;
}

export interface LegsSettings {
  pool: number;
  barrage: number;
  A: BracketLegs;
  B: BracketLegs;
}

export const DEFAULT_LEGS: LegsSettings = {
  pool: 3,
  barrage: 1,
  A: { early: 3, semi: 5, final: 5 },
  B: { early: 3, semi: 3, final: 5 },
};

export interface TimingSettings {
  /** Gemiddelde duur van één leg. */
  minutesPerLeg: number;
  /** Wisseltijd tussen twee matchen op hetzelfde bord. */
  changeoverMinutes: number;
  /** Tijd tussen het einde van de poules en de start van de KO-schema's. */
  transitionMinutes: number;
  /** Een speler die minder dan zoveel minuten geleden speelde, krijgt liever nog geen nieuwe match. */
  minRestMinutes: number;
}

export const DEFAULT_TIMING: TimingSettings = {
  minutesPerLeg: 6,
  changeoverMinutes: 2,
  transitionMinutes: 5,
  minRestMinutes: 5,
};

export interface PointsRule {
  from: number;
  /** null = en verder. */
  to: number | null;
  points: number;
}

export interface PointsSettings {
  table: PointsRule[];
  /** Deelnamepunten per aanwezigheid (bovenop de plaatsingspunten). */
  participation: number;
}

export const DEFAULT_POINTS: PointsSettings = {
  table: [
    { from: 1, to: 1, points: 25 },
    { from: 2, to: 2, points: 20 },
    { from: 3, to: 4, points: 15 },
    { from: 5, to: 8, points: 10 },
    { from: 9, to: 16, points: 6 },
    { from: 17, to: null, points: 3 },
  ],
  participation: 2,
};

export interface BestOfSettings {
  enabled: boolean;
  /** Aantal avonden dat meetelt (X in "beste X van Y"). */
  count: number;
  /** Aantal geplande avonden (Y), enkel ter info. */
  of: number;
}

export const DEFAULT_BEST_OF: BestOfSettings = { enabled: true, count: 8, of: 11 };

export interface SeasonSettings {
  points: PointsSettings;
  bestOf: BestOfSettings;
  legs: LegsSettings;
  timing: TimingSettings;
  /** Inleg in euro. */
  entryFee: number;
  /** Aantal doorstromers per poule naar het A-schema. */
  advancePerPool: number;
  /** A-finale wacht tot alle andere matchen gedaan zijn en wordt op het hoofdbord gespeeld. */
  holdFinal: boolean;
  /** Uren in lokale tijd (Europe/Brussels), "uu:mm". */
  startTime: string;
  registrationCloses: string;
  endLimit: string;
}

export const DEFAULT_SEASON_SETTINGS: SeasonSettings = {
  points: DEFAULT_POINTS,
  bestOf: DEFAULT_BEST_OF,
  legs: DEFAULT_LEGS,
  timing: DEFAULT_TIMING,
  entryFee: 5,
  advancePerPool: 2,
  holdFinal: true,
  startTime: '19:00',
  registrationCloses: '18:30',
  endLimit: '23:15',
};

/** Vult ontbrekende velden aan met de standaard (handig voor oudere seizoensinstellingen). */
export function withDefaults(partial: Partial<SeasonSettings> | null | undefined): SeasonSettings {
  const p = partial ?? {};
  return {
    ...DEFAULT_SEASON_SETTINGS,
    ...p,
    points: { ...DEFAULT_POINTS, ...p.points },
    bestOf: { ...DEFAULT_BEST_OF, ...p.bestOf },
    legs: {
      ...DEFAULT_LEGS,
      ...p.legs,
      A: { ...DEFAULT_LEGS.A, ...p.legs?.A },
      B: { ...DEFAULT_LEGS.B, ...p.legs?.B },
    },
    timing: { ...DEFAULT_TIMING, ...p.timing },
  };
}

export const MINUTE = 60_000;
