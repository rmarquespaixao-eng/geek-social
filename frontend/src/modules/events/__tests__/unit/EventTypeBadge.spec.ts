import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EventTypeBadge from '../../components/EventTypeBadge.vue'

describe('EventTypeBadge', () => {
  it('renders Presencial for type=presencial', () => {
    const wrapper = mount(EventTypeBadge, { props: { type: 'presencial' } })
    expect(wrapper.text()).toContain('Presencial')
    expect(wrapper.attributes('data-testid')).toBe('event-type-presencial')
  })

  it('renders Online for type=online', () => {
    const wrapper = mount(EventTypeBadge, { props: { type: 'online' } })
    expect(wrapper.text()).toContain('Online')
    expect(wrapper.attributes('data-testid')).toBe('event-type-online')
  })
})
