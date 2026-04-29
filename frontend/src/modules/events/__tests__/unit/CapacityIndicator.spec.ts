import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CapacityIndicator from '../../components/CapacityIndicator.vue'

describe('CapacityIndicator', () => {
  it('shows X/Y when capacity is set', () => {
    const wrapper = mount(CapacityIndicator, {
      props: { confirmed: 8, capacity: 10, waitlist: 2 },
    })
    expect(wrapper.text()).toContain('8/10')
    expect(wrapper.text()).toContain('2 na lista')
  })

  it('hides waitlist segment when waitlist is zero', () => {
    const wrapper = mount(CapacityIndicator, { props: { confirmed: 1, capacity: 5 } })
    expect(wrapper.text()).not.toContain('na lista')
  })

  it('shows "sem limite" when capacity is null', () => {
    const wrapper = mount(CapacityIndicator, { props: { confirmed: 4, capacity: null } })
    expect(wrapper.text()).toContain('sem limite')
    expect(wrapper.text()).toContain('4')
  })

  it('marks full state visually when confirmed >= capacity', () => {
    const wrapper = mount(CapacityIndicator, { props: { confirmed: 10, capacity: 10 } })
    expect(wrapper.html()).toContain('text-amber-400')
  })
})
