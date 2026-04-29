import type { ConversationsService } from '../../../modules/chat/conversations.service.js'
import type { MessagesService } from '../../../modules/chat/messages.service.js'
import type { ChatGateway } from '../../../modules/chat/chat.gateway.js'

const TTL_DAYS = 30
const CLEANUP_BATCH_LIMIT = 200

export type TemporaryCleanupDeps = {
  conversationsService: ConversationsService
  messagesService: MessagesService
  chatGateway: ChatGateway
}

/**
 * Job 1 — varre as DMs em modo temporário e, para cada membro que NÃO está
 * com a DM ativa em nenhuma aba, apaga as mensagens recebidas que ele já leu.
 *
 * Roda a cada 60s (configurado em app.ts). É fallback do socket `chat:dm:leave`
 * para casos em que ele não chegou (browser crash, mobile killed, perda de rede).
 */
export async function runTemporaryCleanupRead(deps: TemporaryCleanupDeps): Promise<void> {
  const dms = await deps.conversationsService.findTemporaryDms()
  for (const dm of dms) {
    const members = await deps.conversationsService.getConversationMembers(dm.id)
    const memberIds = members.map(m => m.userId)
    for (const member of members) {
      if (!member.lastReadAt) continue
      if (deps.chatGateway.isUserActiveInDm(member.userId, dm.id)) continue
      const { hiddenOnly, hardDeleted } = await deps.messagesService.cleanupReadTemporary(
        dm.id, member.userId, member.lastReadAt, memberIds,
      )
      for (const msg of hiddenOnly) {
        deps.chatGateway.emitMessageDeletedForUser(member.userId, dm.id, msg.id)
      }
      for (const msg of hardDeleted) {
        deps.chatGateway.emitMessageDeleted(dm.id, msg.id)
      }
    }
  }
}

/**
 * Job 2 — TTL absoluto: apaga mensagens temporárias com mais de 30 dias,
 * independente do estado de leitura. Cobre o caso "destinatário sumiu".
 *
 * Roda a cada 1h. Limita o número de mensagens por execução para evitar
 * trabalhar com lock excessivo.
 */
export async function runTemporaryCleanupTtl(deps: TemporaryCleanupDeps): Promise<void> {
  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000)
  const deleted = await deps.messagesService.cleanupExpiredTemporary(cutoff, CLEANUP_BATCH_LIMIT)
  for (const msg of deleted) {
    deps.chatGateway.emitMessageDeleted(msg.conversationId, msg.id)
  }
}
