/**
 * CSV voor Excel op een Belgische pc: `;` als scheidingsteken, komma als
 * decimaalteken en een UTF-8 BOM (anders worden é en ’ verminkt).
 */

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

const BOM = '﻿';

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'ja' : 'nee';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  // Tekst die Excel als formule zou lezen (=, +, -, @) krijgt een apostrof: namen komen soms van buitenaf.
  let text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[;"\r\n]/.test(text) || text !== text.trim()) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T>(rows: readonly T[], columns: ReadonlyArray<CsvColumn<T>>): string {
  const lines = [columns.map((c) => cell(c.header)).join(';'), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(';'))];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Veilige bestandsnaam: "Seizoen 2027" → "seizoen-2027". */
export function fileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  );
}
