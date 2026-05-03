import type { FeatureFlagsRepository } from '../../../../modules/admin/feature-flags/feature-flags.repository.js'

const INITIAL_FLAGS = [
  { key: 'steam_integration', name: 'Integração Steam', description: 'Importação e sincronização de jogos via Steam', enabled: true },
  { key: 'e2ee_chat', name: 'Chat E2EE', description: 'Criptografia ponta a ponta nas mensagens diretas', enabled: true },
  { key: 'offers_marketplace', name: 'Marketplace de Trocas', description: 'Vitrine e sistema de trocas entre usuários', enabled: true },
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
