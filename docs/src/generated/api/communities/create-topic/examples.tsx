// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

const CURL = `curl -X POST 'https://geeksocialapi.homelab-cloud.com/communities/{id}/topics' \\
  -H 'Authorization: Bearer SEU_ACCESS_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"Melhores jogos de 2025","content":"Qual foi o jogo do ano para você?"}'`

const NODE = `await fetch('https://geeksocialapi.homelab-cloud.com/communities/{id}/topics', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
  body: JSON.stringify({"title":"Melhores jogos de 2025","content":"Qual foi o jogo do ano para você?"}),
})`

export default function Examples() {
  return (
    <Tabs items={['cURL', 'Node fetch']}>
      <Tab value="cURL">
        <pre className="text-xs"><code>{CURL}</code></pre>
      </Tab>
      <Tab value="Node fetch">
        <pre className="text-xs"><code>{NODE}</code></pre>
      </Tab>
    </Tabs>
  )
}
