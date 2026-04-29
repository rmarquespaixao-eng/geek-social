import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EventStatusBadge from '../../components/EventStatusBadge.vue'
import type { EventStatus } from '../../types'

describe('EventStatusBadge', () => {
  const cases: { status: EventStatus; label: string }[] = [
    { status: 'scheduled', label: 'Agendado' },
    { status: 'cancelled', label: 'Cancelado' },
    { status: 'ended', label: 'Encerrado' },
  ]

  for (const c of cases) {
    it(`renders label "${c.label}" for status=${c.status}`, () => {
      const wrapper = mount(EventStatusBadge, { props: { status: c.status } })
      expect(wrapper.text()).toBe(c.label)
      expect(wrapper.attributes('data-testid')).toBe(`event-status-${c.status}`)
    })
  }
})
