import type { FeatureFlagsRepository } from '../../../../modules/admin/feature-flags/feature-flags.repository.js'

const INITIAL_FLAGS = [
  // ── Módulos navegáveis (desativar oculta do sidebar + bloqueia rota) ──
  { key: 'module_feed', name: 'Módulo: Feed', description: 'Feed de atividades e posts dos amigos', enabled: true },
  { key: 'module_communities', name: 'Módulo: Comunidades', description: 'Página e navegação de comunidades', enabled: true },
  { key: 'module_collections', name: 'Módulo: Coleções', description: 'Coleções pessoais de itens geek', enabled: true },
  { key: 'module_marketplace', name: 'Módulo: Vitrine/Marketplace', description: 'Vitrine e sistema de trocas entre usuários', enabled: true },
  { key: 'module_roles', name: 'Módulo: Rolê/Eventos', description: 'Criação e participação em eventos geek', enabled: true },
  { key: 'module_friends', name: 'Módulo: Amigos', description: 'Sistema de amizades e solicitações', enabled: true },
  { key: 'module_chat', name: 'Módulo: Chat', description: 'Mensagens diretas e conversas', enabled: true },
  { key: 'module_notifications', name: 'Módulo: Notificações', description: 'Central de notificações do usuário', enabled: true },
  // ── Funcionalidades específicas ────────────────────────────────────
  { key: 'steam_integration', name: 'Integração Steam', description: 'Importação e sincronização de jogos via Steam', enabled: true },
  { key: 'e2ee_chat', name: 'Chat E2EE', description: 'Criptografia ponta a ponta nas mensagens diretas', enabled: true },
  { key: 'offers_marketplace', name: 'Trocas (Marketplace)', description: 'Funcionalidade de troca de itens entre usuários', enabled: true },
  { key: 'push_notifications', name: 'Notificações Push', description: 'Notificações push via Web Push API', enabled: true },
  { key: 'new_registrations', name: 'Novos Cadastros', description: 'Permitir criação de novas contas', enabled: true },
  { key: 'community_creation', name: 'Criação de Comunidades', description: 'Permitir que usuários criem novas comunidades', enabled: true },
]

export async function seedFeatureFlags(repo: FeatureFlagsRepository): Promise<void> {
  for (const flag of INITIAL_FLAGS) {
    const existing = await repo.findByKey(flag.key)
    if (!existing) {
      await repo.create(flag, null)
    }
  }
}
