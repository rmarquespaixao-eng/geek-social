'use client'

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let initialized = false
function ensureInit(theme: 'default' | 'dark') {
  if (initialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme,
    themeVariables: {
      fontFamily: 'inherit',
      fontSize: '14px',
    },
    securityLevel: 'loose',
  })
  initialized = true
}

type Props = {
  chart: string
}

export function Mermaid({ chart }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
      || window.matchMedia('(prefers-color-scheme: dark)').matches
    ensureInit(isDark ? 'dark' : 'default')
    const id = `mmd-${Math.random().toString(36).slice(2, 9)}`
    let cancelled = false
    mermaid.render(id, chart).then(({ svg }) => {
      if (!cancelled) setSvg(svg)
    }).catch((err) => {
      if (!cancelled) setSvg(`<pre>Erro renderizando diagrama: ${String(err)}</pre>`)
    })
    return () => { cancelled = true }
  }, [chart])

  return (
    <div
      ref={ref}
      className="my-4 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
