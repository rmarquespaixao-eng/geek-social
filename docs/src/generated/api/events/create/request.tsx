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
              <td className="py-1 pr-4 font-mono text-xs">title <span className="text-rose-500">*</span></td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">Título do evento</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">description</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">Descrição do evento</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">date <span className="text-rose-500">*</span></td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string (ISO 8601)</td>
              <td className="py-1 text-xs">Data e hora do evento</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">location</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">Local do evento</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">isOnline</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">boolean</td>
              <td className="py-1 text-xs">Se o evento é online</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">maxParticipants</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">number</td>
              <td className="py-1 text-xs">Número máximo de participantes</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">coverUrl</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">URL da imagem de capa</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
