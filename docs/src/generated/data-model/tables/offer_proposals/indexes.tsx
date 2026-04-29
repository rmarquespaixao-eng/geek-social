// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Indexes() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Nome</th><th className="text-left">Único</th><th className="text-left">Colunas</th><th className="text-left">WHERE (parcial)</th></tr></thead>
        <tbody>
        <tr>
          <td className="font-mono text-sm">offer_proposals_offer_idx</td>
          <td>não</td>
          <td className="font-mono">offer_id, created_at</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">offer_proposals_one_pending_uniq</td>
          <td>sim</td>
          <td className="font-mono">offer_id</td>
          <td className="font-mono text-xs">[object Object] = 'pending'</td>
        </tr>
        </tbody>
      </table>
    </div>
  )
}
