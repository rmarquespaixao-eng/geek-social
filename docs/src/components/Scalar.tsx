'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'

const ApiReferenceReact = dynamic(
  () => import('@scalar/api-reference-react').then((mod) => mod.ApiReferenceReact),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] flex items-center justify-center text-fd-muted-foreground text-sm border rounded-lg bg-fd-muted/30">
        Carregando sandbox interativo…
      </div>
    ),
  },
)

type Props = {
  operationId?: string
}

export function Scalar({ operationId }: Props) {
  const config = useMemo(
    () => ({
      url: '/openapi.json',
      hideClientButton: false,
      hideDownloadButton: true,
      hideTestRequestButton: false,
      ...(operationId ? { initialOperation: operationId } : {}),
    }),
    [operationId],
  )

  return (
    <div className="scalar-wrapper my-6 rounded-lg border bg-fd-card overflow-hidden">
      <ApiReferenceReact configuration={config} />
    </div>
  )
}
