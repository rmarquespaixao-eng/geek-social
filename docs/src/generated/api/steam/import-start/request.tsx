// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Request() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
      <thead><tr><th className="text-left">Campo</th><th className="text-left">Tipo</th><th className="text-left">Requerido</th><th className="text-left">Descrição</th></tr></thead>
      <tbody>
        <tr><td className="font-mono">collectionId</td><td className="font-mono text-xs">string (uuid)</td><td>não</td><td></td></tr>
        <tr><td className="font-mono">newCollectionName</td><td className="font-mono text-xs">string</td><td>não</td><td></td></tr>
        <tr><td className="font-mono">appIds</td><td className="font-mono text-xs">Array of integer</td><td>sim</td><td></td></tr>
        <tr><td className="font-mono">gamesSnapshot</td><td className="font-mono text-xs">Array of object</td><td>não</td><td></td></tr>
      </tbody>
    </table>
    </div>
  )
}
