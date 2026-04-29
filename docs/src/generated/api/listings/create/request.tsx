// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Request() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
      <thead><tr><th className="text-left">Campo</th><th className="text-left">Tipo</th><th className="text-left">Requerido</th><th className="text-left">Descrição</th></tr></thead>
      <tbody>
        <tr><td className="font-mono">itemId</td><td className="font-mono text-xs">string (uuid)</td><td>sim</td><td></td></tr>
        <tr><td className="font-mono">availability</td><td className="font-mono text-xs">"sale" | "trade" | "both"</td><td>sim</td><td></td></tr>
        <tr><td className="font-mono">askingPrice</td><td className="font-mono text-xs">object</td><td>não</td><td></td></tr>
        <tr><td className="font-mono">paymentMethods</td><td className="font-mono text-xs">Array of "pix" | "money" | "transfer" | "card" | "negotiate"</td><td>não</td><td></td></tr>
        <tr><td className="font-mono">disclaimerAccepted</td><td className="font-mono text-xs">true</td><td>sim</td><td></td></tr>
      </tbody>
    </table>
    </div>
  )
}
