// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Request() {
  return (
    <div className="not-prose space-y-4">
      <div>
        <h4 className="font-semibold text-sm mb-2">Query Parameters</h4>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 pr-4 font-mono text-xs">Param</th>
              <th className="text-left py-1 pr-4 text-xs">Tipo</th>
              <th className="text-left py-1 text-xs">Descrição</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">q</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">Busca textual por nome</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">cursor</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">string</td>
              <td className="py-1 text-xs">Cursor de paginação</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">limit</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">number (1–100)</td>
              <td className="py-1 text-xs">Quantidade de resultados (padrão: 30)</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">sort</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">recent|oldest|name|name_desc|rating</td>
              <td className="py-1 text-xs">Ordenação dos resultados</td>
            </tr>
            <tr className="border-b border-fd-border/50">
              <td className="py-1 pr-4 font-mono text-xs">collection_id</td>
              <td className="py-1 pr-4 text-xs text-fd-muted-foreground">uuid</td>
              <td className="py-1 text-xs">Filtrar por coleção específica</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
