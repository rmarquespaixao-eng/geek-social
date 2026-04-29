import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { server } from './mocks/server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
