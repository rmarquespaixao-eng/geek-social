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
          <td className="font-mono text-sm">conversation_id</td>
          <td className="font-mono text-xs">uuid</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">user_id</td>
          <td className="font-mono text-xs">uuid</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">role</td>
          <td className="font-mono text-xs">enumcolumn</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">member</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">permissions</td>
          <td className="font-mono text-xs">jsonb</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">{'{'}"can_send_messages":true,"can_send_files":true{'}'}</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">joined_at</td>
          <td className="font-mono text-xs">timestamp</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">now()</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">last_read_at</td>
          <td className="font-mono text-xs">timestamp</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">is_archived</td>
          <td className="font-mono text-xs">boolean</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">false</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">hidden_at</td>
          <td className="font-mono text-xs">timestamp</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">is_muted</td>
          <td className="font-mono text-xs">boolean</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">false</td>
        </tr>
        </tbody>
      </table>
      <p className="text-xs text-fd-muted-foreground"><span className="text-amber-500">●</span> primary key &nbsp; <span className="text-sky-500">◆</span> unique</p>
    </div>
  )
}
