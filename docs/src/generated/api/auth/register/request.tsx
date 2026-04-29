// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Request() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
      <thead><tr><th className="text-left">Campo</th><th className="text-left">Tipo</th><th className="text-left">Requerido</th><th className="text-left">Descrição</th></tr></thead>
      <tbody>
        <tr><td className="font-mono">email</td><td className="font-mono text-xs">string (email)</td><td>sim</td><td>E-mail do usuário (precisa ser único)</td></tr>
        <tr><td className="font-mono">password</td><td className="font-mono text-xs">string</td><td>sim</td><td>Senha em texto plano. Hash aplicado com bcrypt antes de persistir.</td></tr>
        <tr><td className="font-mono">displayName</td><td className="font-mono text-xs">string</td><td>sim</td><td>Nome público exibido no perfil.</td></tr>
      </tbody>
    </table>
    </div>
  )
}
