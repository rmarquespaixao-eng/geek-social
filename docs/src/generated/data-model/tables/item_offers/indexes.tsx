// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Indexes() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Nome</th><th className="text-left">Único</th><th className="text-left">Colunas</th><th className="text-left">WHERE (parcial)</th></tr></thead>
        <tbody>
        <tr>
          <td className="font-mono text-sm">item_offers_pending_unique</td>
          <td>sim</td>
          <td className="font-mono">item_id, offerer_id</td>
          <td className="font-mono text-xs">[object Object] = 'pending'</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">item_offers_owner_status_idx</td>
          <td>não</td>
          <td className="font-mono">owner_id, status, created_at</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">item_offers_offerer_status_idx</td>
          <td>não</td>
          <td className="font-mono">offerer_id, status, created_at</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">item_offers_listing_idx</td>
          <td>não</td>
          <td className="font-mono">listing_id</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        </tbody>
      </table>
    </div>
  )
}
