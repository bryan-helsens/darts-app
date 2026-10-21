/** Bestand laten downloaden vanuit de browser (CSV, JSON, …). */
export function downloadFile(name: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Even wachten: sommige browsers lezen de URL pas na de klik.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
