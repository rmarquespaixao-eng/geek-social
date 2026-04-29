import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DurationPicker from '../../components/DurationPicker.vue'

describe('DurationPicker', () => {
  it('emits the typed minute value', async () => {
    const wrapper = mount(DurationPicker, { props: { modelValue: 60 } })
    const input = wrapper.get('[data-testid="duration-picker"]')
    await input.setValue('150')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([150])
  })

  it('clamps below the minimum to the minimum', async () => {
    const wrapper = mount(DurationPicker, { props: { modelValue: 60 } })
    const input = wrapper.get('[data-testid="duration-picker"]')
    await input.setValue('5')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([15])
  })

  it('renders the human-readable helper for the current value', () => {
    const wrapper = mount(DurationPicker, { props: { modelValue: 90 } })
    expect(wrapper.text()).toContain('1h 30min')
  })
})
