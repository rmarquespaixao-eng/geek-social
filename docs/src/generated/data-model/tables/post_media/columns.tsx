// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Columns() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Coluna</th><th className="text-left">Tipo</th><th className="text-left">Nullable</th><th className="text-left">Default</th></tr></thead>
        <tbody>
        <tr>
          <td className="font-mono text-sm">id <span title="primary key" className="text-amber-500">●</span></td>
          <td className="font-mono text-xs">uuid</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">gen_random_uuid()</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">post_id</td>
          <td className="font-mono text-xs">uuid</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">url</td>
          <td className="font-mono text-xs">text</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">thumbnail_url</td>
          <td className="font-mono text-xs">text</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">display_order</td>
          <td className="font-mono text-xs">integer</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        </tbody>
      </table>
      <p className="text-xs text-fd-muted-foreground"><span className="text-amber-500">●</span> primary key &nbsp; <span className="text-sky-500">◆</span> unique</p>
    </div>
  )
}
