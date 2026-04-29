// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Fks() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Coluna(s)</th><th className="text-left">Referência</th><th className="text-left">ON DELETE</th><th className="text-left">ON UPDATE</th></tr></thead>
        <tbody>
        <tr>
          <td className="font-mono">offer_id</td>
          <td className="font-mono">item_offers.id</td>
          <td>cascade</td>
          <td>no action</td>
        </tr>
        <tr>
          <td className="font-mono">rater_id</td>
          <td className="font-mono">users.id</td>
          <td>no action</td>
          <td>no action</td>
        </tr>
        <tr>
          <td className="font-mono">ratee_id</td>
          <td className="font-mono">users.id</td>
          <td>no action</td>
          <td>no action</td>
        </tr>
        </tbody>
      </table>
    </div>
  )
}
