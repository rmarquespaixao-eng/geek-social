import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <div className="w-full max-w-3xl text-center">
        <p className="text-xs uppercase tracking-widest text-fd-muted-foreground mb-3">
          Documentação técnica
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Geek Social
        </h1>
        <p className="text-lg text-fd-muted-foreground max-w-2xl mx-auto mb-10">
          Rede social para gamers e colecionadores — perfis, coleções com schema dinâmico,
          chat com áudio/vídeo, Vitrine de troca/venda, integrações Steam.
          100% open-source, self-hosted, sem custo recorrente.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
          <Link
            href="/docs/intro/visao-geral"
            className="inline-flex items-center justify-center rounded-md bg-fd-primary text-fd-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition"
          >
            Começar pelos conceitos
          </Link>
          <Link
            href="/docs/intro/setup-local"
            className="inline-flex items-center justify-center rounded-md border px-5 py-2.5 text-sm font-medium hover:bg-fd-muted transition"
          >
            Setup local
          </Link>
          <Link
            href="/docs/api/visao-geral"
            className="inline-flex items-center justify-center rounded-md border px-5 py-2.5 text-sm font-medium hover:bg-fd-muted transition"
          >
            API Reference
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
          <Link href="/docs/roadmap" className="rounded-lg border p-5 hover:bg-fd-muted/50 transition">
            <h3 className="font-semibold mb-1">Roadmap</h3>
            <p className="text-sm text-fd-muted-foreground">
              Pronto + planejado. Comunidades, recomendação, E2E, painel admin, AI moderation.
            </p>
          </Link>
          <Link href="/docs/intro/filosofia" className="rounded-lg border p-5 hover:bg-fd-muted/50 transition">
            <h3 className="font-semibold mb-1">Filosofia</h3>
            <p className="text-sm text-fd-muted-foreground">
              15 princípios: zero débito, DRY, self-host, tipagem forte, imutabilidade.
            </p>
          </Link>
          <Link href="/docs/data-model/er-diagram" className="rounded-lg border p-5 hover:bg-fd-muted/50 transition">
            <h3 className="font-semibold mb-1">Banco de dados</h3>
            <p className="text-sm text-fd-muted-foreground">
              28 tabelas com dicionário, ER diagrams, convenções Drizzle.
            </p>
          </Link>
          <Link href="/docs/modules/auth" className="rounded-lg border p-5 hover:bg-fd-muted/50 transition">
            <h3 className="font-semibold mb-1">Módulos</h3>
            <p className="text-sm text-fd-muted-foreground">
              13 módulos com sequence diagrams, edge cases, dependências.
            </p>
          </Link>
        </div>

        <p className="text-xs text-fd-muted-foreground mt-16">
          143 endpoints · 28 tabelas · 13 módulos · 681 páginas estáticas
        </p>
      </div>
    </main>
  );
}
