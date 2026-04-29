type Props = {
  what?: string
}

export function ComingSoon({ what = 'Esta seção' }: Props) {
  return (
    <div className="not-prose my-6 rounded-lg border border-dashed bg-fd-muted/40 p-6 text-center">
      <p className="text-sm text-fd-muted-foreground">
        🚧 <strong>{what}</strong> ainda não foi documentada — virá nos sub-projetos seguintes.
      </p>
    </div>
  )
}
