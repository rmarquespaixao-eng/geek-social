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
              <td className="py-1 pr-4 font-mono text-xs">name <span className="text-rose-500">*</span></td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">Nome da comunidade</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">description</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">Descrição da comunidade</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">isPrivate</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">boolean</td>
              <td className="py-1 text-xs">Se a comunidade é privada (padrão: false)</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">tags</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string[]</td>
              <td className="py-1 text-xs">Tags para categorizar a comunidade</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
