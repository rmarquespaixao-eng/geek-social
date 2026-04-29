// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

const CURL = `curl -X PUT 'http://localhost:3003/users/me/cover-color' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer SEU_ACCESS_TOKEN' \\
  -d '{}'`

const NODE = `await fetch('http://localhost:3003/users/me/cover-color', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + accessToken,
  },
  body: JSON.stringify({}),
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
