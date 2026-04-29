import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WaitlistPositionBadge from '../../components/WaitlistPositionBadge.vue'

describe('WaitlistPositionBadge', () => {
  it('shows the position number', () => {
    const wrapper = mount(WaitlistPositionBadge, { props: { position: 3 } })
    expect(wrapper.text()).toContain('#3')
    expect(wrapper.text().toLowerCase()).toContain('lista de espera')
  })
})
