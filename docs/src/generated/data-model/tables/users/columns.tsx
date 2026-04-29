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
          <td className="font-mono text-sm">email <span title="unique" className="text-sky-500">◆</span></td>
          <td className="font-mono text-xs">varchar</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">password_hash</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">display_name</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">bio</td>
          <td className="font-mono text-xs">text</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">avatar_url</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">cover_url</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">cover_color</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">profile_background_url</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">profile_background_color</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">privacy</td>
          <td className="font-mono text-xs">enumcolumn</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">public</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">email_verified</td>
          <td className="font-mono text-xs">boolean</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">false</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">show_presence</td>
          <td className="font-mono text-xs">boolean</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">true</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">show_read_receipts</td>
          <td className="font-mono text-xs">boolean</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">true</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">steam_id <span title="unique" className="text-sky-500">◆</span></td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">steam_linked_at</td>
          <td className="font-mono text-xs">timestamp</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">steam_api_key</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">google_id <span title="unique" className="text-sky-500">◆</span></td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">google_linked_at</td>
          <td className="font-mono text-xs">timestamp</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">birthday</td>
          <td className="font-mono text-xs">datestring</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">interests</td>
          <td className="font-mono text-xs">jsonb</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">[]</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">pronouns</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">location</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">website</td>
          <td className="font-mono text-xs">varchar</td>
          <td>NULL ok</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">created_at</td>
          <td className="font-mono text-xs">timestamp</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">now()</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">updated_at</td>
          <td className="font-mono text-xs">timestamp</td>
          <td>NOT NULL</td>
          <td className="font-mono text-xs">now()</td>
        </tr>
        </tbody>
      </table>
      <p className="text-xs text-fd-muted-foreground"><span className="text-amber-500">●</span> primary key &nbsp; <span className="text-sky-500">◆</span> unique</p>
    </div>
  )
}
