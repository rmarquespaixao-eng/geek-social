import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { initializeAuth } from '@/shared/auth/authInit'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  await initializeAuth()

  app.use(router)
  app.mount('#app')
}

bootstrap().catch((err) => {
  console.error('[bootstrap] Fatal startup error', err)
})
