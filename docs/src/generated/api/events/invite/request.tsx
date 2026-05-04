// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Request() {
  return (
    <div className="not-prose space-y-4">
      <div>
        <h4 className="font-semibold text-sm mb-2">Body (JSON)</h4>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 pr-4 font-mono text-xs">Campo</th>
              <th className="text-left py-1 pr-4 text-xs">Tipo</th>
              <th className="text-left py-1 text-xs">Descrição</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">userId <span className="text-rose-500">*</span></td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string (uuid)</td>
              <td className="py-1 text-xs">ID do usuário a ser convidado</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
