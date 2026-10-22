/** Getallen zoals in Vlaanderen: komma als decimaalteken ("54,30"). */
export function formatDecimal(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toFixed(digits).replace('.', ',');
}
