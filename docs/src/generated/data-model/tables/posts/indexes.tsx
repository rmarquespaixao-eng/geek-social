// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Indexes() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Nome</th><th className="text-left">Único</th><th className="text-left">Colunas</th><th className="text-left">WHERE (parcial)</th></tr></thead>
        <tbody>
        <tr>
          <td className="font-mono text-sm">posts_user_created_at_idx</td>
          <td>não</td>
          <td className="font-mono">user_id, created_at</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">posts_visibility_created_at_idx</td>
          <td>não</td>
          <td className="font-mono">visibility, created_at</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">posts_item_id_idx</td>
          <td>não</td>
          <td className="font-mono">item_id</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        </tbody>
      </table>
    </div>
  )
}
