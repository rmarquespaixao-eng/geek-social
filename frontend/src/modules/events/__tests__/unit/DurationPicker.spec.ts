import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DurationPicker from '../../components/DurationPicker.vue'

describe('DurationPicker', () => {
  it('emits the mapped minute value when key changes', async () => {
    const wrapper = mount(DurationPicker, { props: { modelValue: 60 } })
    const select = wrapper.get('[data-testid="duration-picker"]')
    await select.setValue('3h')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([180])

    await select.setValue('dia')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([600])
  })

  it('selects the matching key when modelValue corresponds to a known mapping', () => {
    const wrapper = mount(DurationPicker, { props: { modelValue: 240 } })
    const select = wrapper.get('select').element as HTMLSelectElement
    expect(select.value).toBe('4h')
  })
})
