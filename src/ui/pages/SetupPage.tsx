/** Getoond zolang de koppeling met Supabase niet ingesteld is. */
export function SetupPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-2xl font-bold text-brand-900">Sanapolis Darts: nog niet gekoppeld</h1>
      <p className="mb-4 text-stone-700">
        De app weet nog niet met welke database (Supabase) ze moet praten. Stel deze twee omgevingsvariabelen in en bouw de site opnieuw:
      </p>
      <pre className="overflow-x-auto rounded-xl bg-stone-900 p-4 text-sm text-stone-100">
        VITE_SUPABASE_URL=https://…supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=…
      </pre>
      <p className="mt-4 text-stone-700">
        Op Netlify: <i>Site configuration → Environment variables</i>, daarna <i>Deploys → Trigger deploy</i>. Lokaal: kopieer <code>.env.example</code> naar{' '}
        <code>.env.local</code>. De stappen staan in de README.
      </p>
    </main>
  );
}
