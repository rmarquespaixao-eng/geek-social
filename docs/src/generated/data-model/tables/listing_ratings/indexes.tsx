// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Indexes() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Nome</th><th className="text-left">Único</th><th className="text-left">Colunas</th><th className="text-left">WHERE (parcial)</th></tr></thead>
        <tbody>
        <tr>
          <td className="font-mono text-sm">listing_ratings_offer_rater_uniq</td>
          <td>sim</td>
          <td className="font-mono">offer_id, rater_id</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">listing_ratings_ratee_idx</td>
          <td>não</td>
          <td className="font-mono">ratee_id</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        <tr>
          <td className="font-mono text-sm">listing_ratings_offer_idx</td>
          <td>não</td>
          <td className="font-mono">offer_id</td>
          <td className="font-mono text-xs">—</td>
        </tr>
        </tbody>
      </table>
    </div>
  )
}
