// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

const CURL = `curl -X GET 'https://geeksocialapi.homelab-cloud.com/events/me/attending' \\
  -H 'Authorization: Bearer SEU_ACCESS_TOKEN'`

const NODE = `await fetch('https://geeksocialapi.homelab-cloud.com/events/me/attending', {
  method: 'GET',
  headers: { Authorization: 'Bearer ' + accessToken },
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
