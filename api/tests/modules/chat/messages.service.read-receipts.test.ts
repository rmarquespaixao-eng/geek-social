import { describe, it, expect } from 'vitest'
import { computeSeen } from '../../../src/modules/chat/messages.service.js'

const baseMsg = { id: 'm1', userId: 'me', conversationId: 'c1', createdAt: new Date('2026-04-26T10:00:00Z') }

describe('computeSeen — DM', () => {
  it('retorna null quando viewer.showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: false,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: new Date('2026-04-26T10:01:00Z'), showReadReceipts: true }],
    })).toBeNull()
  })

  it('retorna null quando peer.showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: new Date('2026-04-26T10:01:00Z'), showReadReceipts: false }],
    })).toBeNull()
  })

  it('seen=true quando peer.lastReadAt >= message.createdAt', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: new Date('2026-04-26T10:01:00Z'), showReadReceipts: true }],
    })).toEqual({ type: 'dm', seen: true })
  })

  it('seen=false quando peer ainda não leu', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: null, showReadReceipts: true }],
    })).toEqual({ type: 'dm', seen: false })
  })
})

describe('computeSeen — grupo', () => {
  it('retorna null quando viewer.showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: false,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: new Date('2026-04-26T10:02:00Z'), showReadReceipts: true },
        { userId: 'b', lastReadAt: null, showReadReceipts: true },
      ],
    })).toBeNull()
  })

  it('count=2 / total=2 quando todos os outros leram (todos com flag true)', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: new Date('2026-04-26T10:02:00Z'), showReadReceipts: true },
        { userId: 'b', lastReadAt: new Date('2026-04-26T10:03:00Z'), showReadReceipts: true },
      ],
    })).toEqual({ type: 'group', count: 2, total: 2 })
  })

  it('count exclui membros com showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: new Date('2026-04-26T10:02:00Z'), showReadReceipts: true },
        { userId: 'b', lastReadAt: new Date('2026-04-26T10:03:00Z'), showReadReceipts: false },
      ],
    })).toEqual({ type: 'group', count: 1, total: 2 })
  })

  it('count=0 quando ninguém leu', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: null, showReadReceipts: true },
        { userId: 'b', lastReadAt: null, showReadReceipts: true },
      ],
    })).toEqual({ type: 'group', count: 0, total: 2 })
  })
})
