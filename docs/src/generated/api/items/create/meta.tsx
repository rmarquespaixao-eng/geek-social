// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  POST: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  PUT: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  PATCH: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  DELETE: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
}

export default function Meta() {
  return (
    <div className="not-prose flex flex-wrap items-center gap-3 my-6 p-4 rounded-lg border bg-fd-card text-fd-card-foreground">
      <span className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border ${METHOD_COLOR["POST"] ?? 'bg-fd-muted'}`}>
        POST
      </span>
      <code className="text-sm font-mono">/collections/{'{'}collectionId{'}'}/items</code>
      <span className="ml-auto text-xs text-fd-muted-foreground">
        Auth: <span className="font-mono">accessToken</span>
      </span>
    </div>
  )
}
