# HttpOnly Cookie Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o accessToken do localStorage para memória (Pinia) e usar o refreshToken httpOnly cookie já existente no backend para reautenticação silenciosa, eliminando o risco de roubo de token via XSS.

**Architecture:** O accessToken fica apenas em memória (Pinia `ref<string | null>`). No carregamento da página, `initializeAuth()` chama `POST /auth/refresh` (que usa o cookie httpOnly do refreshToken) para obter um novo accessToken. O interceptor 401 do axios faz refresh automático quando o token expira (15min), sem logout do usuário. O backend não precisa de nenhuma alteração — já retorna `{ accessToken, user }` no body do login/register e já seta o `refreshToken` como cookie httpOnly.

**Tech Stack:** Vue 3, TypeScript, Pinia, Axios, Socket.IO-client, Vue Router 4

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `src/shared/auth/authStore.ts` | Modificar | Remove localStorage; adiciona `setToken()` |
| `src/shared/http/api.ts` | Modificar | `withCredentials: true`; token do store; interceptor 401 com refresh+retry |
| `src/shared/auth/authInit.ts` | Criar | `initializeAuth()` — refresh silencioso no startup |
| `src/main.ts` | Modificar | Await `initializeAuth()` antes do mount |
| `src/router/index.ts` | Modificar | Guard usa `store.isAuthenticated` (Pinia), não localStorage |
| `src/shared/auth/useAuth.ts` | Modificar | `login`/`register` agora usados pelas views; `loadUser` simplificado |
| `src/modules/auth/views/LoginView.vue` | Modificar | Usa `useAuth().login()` ao invés de `authService` diretamente |
| `src/modules/auth/views/RegisterView.vue` | Modificar | Usa `useAuth().register()` ao invés de `authService` diretamente |

---

### Task 1: authStore — remover localStorage, adicionar setToken

**Files:**
- Modify: `src/shared/auth/authStore.ts`

- [ ] **Step 1: Substituir o conteúdo completo do arquivo**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/shared/types/auth.types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)

  function setAuth(newToken: string, newUser: User) {
    token.value = newToken
    user.value = newUser
  }

  function setToken(newToken: string) {
    token.value = newToken
  }

  function clearAuth() {
    token.value = null
    user.value = null
  }

  return { user, token, isAuthenticated, setAuth, setToken, clearAuth }
})
```

- [ ] **Step 2: Verificar que não há erros de compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep -E "authStore|error" | head -20
```

Expected: sem erros relacionados a `authStore.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/auth/authStore.ts
git commit -m "refactor(auth): remove localStorage from authStore, add setToken"
```

---

### Task 2: api.ts — withCredentials, token do store, interceptor 401 com refresh+retry

**Files:**
- Modify: `src/shared/http/api.ts`

- [ ] **Step 1: Substituir o conteúdo completo do arquivo**

```typescript
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { useAuthStore } from '@/shared/auth/authStore'

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Injeta Authorization header com token em memória
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const store = useAuthStore()
  if (store.token && config.headers) {
    config.headers.Authorization = `Bearer ${store.token}`
  }
  return config
})

// Em 401: tenta refresh silencioso, repete request original; em falha, redireciona ao login
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401) return Promise.reject(error)
    if (originalRequest._retry) return Promise.reject(error)
    if (originalRequest.url?.includes('/auth/refresh')) return Promise.reject(error)

    originalRequest._retry = true

    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/refresh')
      const store = useAuthStore()
      store.setToken(data.accessToken)
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
      }
      return api(originalRequest)
    } catch {
      const store = useAuthStore()
      store.clearAuth()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }
  },
)
```

> Nota: `TOKEN_KEY` foi removido — `authStore.ts` e `router/index.ts` não devem mais importá-lo.

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "api\.ts\|TOKEN_KEY\|error TS" | head -20
```

Expected: sem erros em `api.ts`. Pode aparecer erros de `TOKEN_KEY` em outros arquivos — serão corrigidos nas próximas tasks.

- [ ] **Step 3: Commit**

```bash
git add src/shared/http/api.ts
git commit -m "refactor(api): use in-memory token, withCredentials, 401 refresh interceptor"
```

---

### Task 3: authInit.ts — refresh silencioso no startup

**Files:**
- Create: `src/shared/auth/authInit.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
import { api } from '@/shared/http/api'
import { useAuthStore } from './authStore'
import { connectSocket } from '@/shared/socket/socket'
import type { User } from '@/shared/types/auth.types'

export async function initializeAuth(): Promise<void> {
  const store = useAuthStore()
  try {
    const { data: refreshData } = await api.post<{ accessToken: string }>('/auth/refresh')
    store.setToken(refreshData.accessToken)
    const { data: userData } = await api.get<User>('/users/me')
    store.user = userData
    connectSocket(refreshData.accessToken)
  } catch {
    store.clearAuth()
  }
}
```

Explicação:
- Chama `POST /auth/refresh` — o cookie httpOnly `refreshToken` é enviado automaticamente pelo browser porque `withCredentials: true`
- Se bem-sucedido: armazena accessToken em memória, busca dados do usuário, conecta socket
- Se falhar (usuário não tem sessão ativa): clearAuth — `isAuthenticated` fica `false`

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "authInit\|error TS" | head -10
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/auth/authInit.ts
git commit -m "feat(auth): add initializeAuth for silent refresh on page load"
```

---

### Task 4: main.ts — await initializeAuth antes do mount

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Substituir o conteúdo completo do arquivo**

```typescript
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

bootstrap()
```

Motivo: Pinia é criada primeiro. `initializeAuth()` usa a store (precisa do Pinia). O router é instalado depois do init, então quando os guards do router rodam na primeira navegação, `store.isAuthenticated` já reflete o estado real (refresh feito ou não).

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "main\.ts\|error TS" | head -10
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): await initializeAuth before mounting app"
```

---

### Task 5: router — guard usa store.isAuthenticated

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: Substituir o conteúdo completo do arquivo**

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/shared/auth/authStore'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/feed',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/modules/auth/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/modules/auth/views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/modules/auth/views/ForgotPasswordView.vue'),
      meta: { public: true },
    },
    {
      path: '/feed',
      name: 'feed',
      component: () => import('@/modules/feed/views/FeedView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/:userId',
      name: 'profile',
      component: () => import('@/modules/auth/views/ProfileView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/modules/auth/views/SettingsView.vue'),
    },
    {
      path: '/friends',
      name: 'friends',
      component: () => import('@/modules/friends/views/FriendsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections',
      name: 'Collections',
      component: () => import('@/modules/collections/views/CollectionsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections/:id',
      name: 'CollectionDetail',
      component: () => import('@/modules/collections/views/CollectionDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections/:id/items/:itemId',
      name: 'ItemDetail',
      component: () => import('@/modules/collections/views/ItemDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/modules/chat/views/ChatView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat/:conversationId',
      name: 'chat-conversation',
      component: () => import('@/modules/chat/views/ChatView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/feed',
    },
  ],
})

router.beforeEach((to) => {
  const store = useAuthStore()
  if (!to.meta.public && !store.isAuthenticated) {
    return { name: 'login' }
  }
  if (to.meta.public && store.isAuthenticated) {
    return { name: 'feed' }
  }
})

export default router
```

- [ ] **Step 2: Verificar compilação — TOKEN_KEY não deve existir mais em nenhum lugar**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
grep -rn "TOKEN_KEY" src/
```

Expected: zero resultados (foi removido de `api.ts`, `authStore.ts` e `router/index.ts`).

- [ ] **Step 3: Verificar compilação TypeScript**

```bash
npx vue-tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/router/index.ts
git commit -m "refactor(router): guard uses Pinia store instead of localStorage"
```

---

### Task 6: useAuth.ts — simplificar loadUser, expor login/register para views

**Files:**
- Modify: `src/shared/auth/useAuth.ts`

- [ ] **Step 1: Substituir o conteúdo completo do arquivo**

```typescript
import { storeToRefs } from 'pinia'
import { useAuthStore } from './authStore'
import { api } from '@/shared/http/api'
import type { LoginPayload, RegisterPayload, AuthResponse, User } from '@/shared/types/auth.types'
import { useRouter } from 'vue-router'
import { connectSocket, disconnectSocket } from '@/shared/socket/socket'
import { requestPushPermission } from '@/shared/pwa/usePush'

export function useAuth() {
  const store = useAuthStore()
  const router = useRouter()
  const { user, token, isAuthenticated } = storeToRefs(store)

  async function login(payload: LoginPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/login', payload)
    store.setAuth(data.accessToken, data.user as User)
    connectSocket(data.accessToken)
    requestPushPermission().catch(() => {})
  }

  async function register(payload: RegisterPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/register', payload)
    store.setAuth(data.accessToken, data.user as User)
    connectSocket(data.accessToken)
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      disconnectSocket()
      store.clearAuth()
      router.push('/login')
    }
  }

  async function loadUser(): Promise<void> {
    try {
      const { data } = await api.get<User>('/users/me')
      if (store.user) {
        store.user = { ...store.user, ...data }
      } else {
        store.user = data
      }
    } catch {
      // falha tratada pelo interceptor 401
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    login,
    register,
    logout,
    loadUser,
  }
}
```

Nota: `AuthResponse.user` é `{ id, email, displayName }` (tipo parcial). O cast `as User` é necessário porque o type `User` tem campos opcionais extras. A store aceita `User` completo — campos extras do perfil chegarão via `loadUser` depois.

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "useAuth\|error TS" | head -10
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/auth/useAuth.ts
git commit -m "refactor(auth): simplify useAuth, loadUser no longer checks store.token"
```

---

### Task 7: LoginView.vue — usa useAuth().login()

**Files:**
- Modify: `src/modules/auth/views/LoginView.vue`

Problema atual: a view chama `authService.login()` diretamente e depois `store.setAuth(result.accessToken, result.user)`, pulando `connectSocket()` e `requestPushPermission()`. Migrar para `useAuth().login()` resolve tudo de uma vez.

- [ ] **Step 1: Ler o bloco `<script setup>` atual para localizar as linhas a alterar**

Abrir `src/modules/auth/views/LoginView.vue` e localizar as importações e o `handleSubmit`.

- [ ] **Step 2: Substituir importações relevantes**

Remover:
```typescript
import { useAuthStore } from '@/shared/auth/authStore'
import * as authService from '../services/authService'
import { useRouter } from 'vue-router'
```

Adicionar (manter o resto das importações existentes):
```typescript
import { useAuth } from '@/shared/auth/useAuth'
```

- [ ] **Step 3: Substituir inicialização de store/router e handleSubmit**

Remover:
```typescript
const store = useAuthStore()
const router = useRouter()
```

Adicionar:
```typescript
const { login } = useAuth()
```

Substituir o bloco `try` dentro de `handleSubmit`:
```typescript
// Antes:
const result = await authService.login({ email: form.email, password: form.password })
store.setAuth(result.accessToken, result.user)
router.push('/feed')

// Depois:
await login({ email: form.email, password: form.password })
router.push('/feed')
```

> `useAuth()` já contém `useRouter()` internamente — precisamos importar `useRouter` separado apenas para o `router.push('/feed')` após o login. Como `useAuth` expõe `login` mas não `router`, importe `useRouter` também:

Importações finais do `<script setup>`:
```typescript
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Gamepad2, Eye, EyeOff } from 'lucide-vue-next'
import { useAuth } from '@/shared/auth/useAuth'
```

E o bloco de setup:
```typescript
const router = useRouter()
const { login } = useAuth()
```

handleSubmit completo:
```typescript
async function handleSubmit() {
  generalError.value = ''
  Object.keys(errors).forEach((k) => delete errors[k])
  loading.value = true

  try {
    await login({ email: form.email, password: form.password })
    router.push('/feed')
  } catch (err: any) {
    const status = err.response?.status
    const message = err.response?.data?.message ?? 'Erro ao fazer login. Tente novamente.'
    if (status === 401) {
      generalError.value = 'E-mail ou senha incorretos.'
    } else if (status === 422 && err.response?.data?.errors) {
      const serverErrors = err.response.data.errors as Record<string, string[]>
      Object.entries(serverErrors).forEach(([field, msgs]) => {
        errors[field] = msgs[0]
      })
    } else {
      generalError.value = message
    }
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 4: Verificar compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "LoginView\|error TS" | head -10
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/views/LoginView.vue
git commit -m "refactor(login): use useAuth().login() instead of authService directly"
```

---

### Task 8: RegisterView.vue — usa useAuth().register()

**Files:**
- Modify: `src/modules/auth/views/RegisterView.vue`

Mesmo padrão da Task 7.

- [ ] **Step 1: Substituir importações relevantes no `<script setup>`**

Remover:
```typescript
import { useAuthStore } from '@/shared/auth/authStore'
import * as authService from '../services/authService'
import { useRouter } from 'vue-router'
```

Adicionar:
```typescript
import { useRouter } from 'vue-router'
import { useAuth } from '@/shared/auth/useAuth'
```

- [ ] **Step 2: Substituir inicialização**

Remover:
```typescript
const store = useAuthStore()
const router = useRouter()
```

Adicionar:
```typescript
const router = useRouter()
const { register } = useAuth()
```

- [ ] **Step 3: Substituir bloco try no handleSubmit**

Antes:
```typescript
const result = await authService.register({
  displayName: form.displayName.trim(),
  email: form.email,
  password: form.password,
})
store.setAuth(result.token, result.user)
router.push('/feed')
```

Depois:
```typescript
await register({
  displayName: form.displayName.trim(),
  email: form.email,
  password: form.password,
})
router.push('/feed')
```

- [ ] **Step 4: Verificar compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "RegisterView\|error TS" | head -10
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/views/RegisterView.vue
git commit -m "refactor(register): use useAuth().register() instead of authService directly"
```

---

### Task 9: SettingsView.vue — atualizar logout (usa useAuth já existente)

**Files:**
- Modify: `src/modules/auth/views/SettingsView.vue`

- [ ] **Step 1: Verificar se SettingsView usa authService.logout() diretamente**

Abrir `src/modules/auth/views/SettingsView.vue` e verificar o `handleLogout`.

Atual (linha ~192):
```typescript
import * as authService from '../services/authService'
...
async function handleLogout() {
  try {
    await authService.logout()
  } finally {
    store.clearAuth()
    router.push('/login')
  }
}
```

- [ ] **Step 2: Migrar para useAuth().logout()**

Remover import de `authService` e `useAuthStore` e `useRouter` se usados só para logout.

Substituir pelo composable:
```typescript
import { useAuth } from '@/shared/auth/useAuth'
const { logout } = useAuth()

async function handleLogout() {
  await logout()
}
```

`useAuth().logout()` já chama `api.post('/auth/logout')`, `disconnectSocket()`, `store.clearAuth()` e `router.push('/login')`.

Se `useAuthStore` for usado em outros pontos da view (como `store.user`), manter a importação mas remover o logout manual.

- [ ] **Step 3: Verificar compilação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "SettingsView\|error TS" | head -10
```

Expected: sem erros.

- [ ] **Step 4: Verificar se há outros arquivos usando TOKEN_KEY ou localStorage para token**

```bash
grep -rn "TOKEN_KEY\|localStorage.*token\|localStorage.*geek_social" src/ --include="*.ts" --include="*.vue"
```

Expected: zero resultados.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/views/SettingsView.vue
git commit -m "refactor(settings): use useAuth().logout()"
```

---

### Task 10: Teste de integração end-to-end

**Objetivo:** Verificar que o fluxo completo funciona — login, refresh automático na recarga, logout, proteção de rotas.

- [ ] **Step 1: Verificar compilação TypeScript sem erros**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npx vue-tsc --noEmit 2>&1 | grep "error TS"
```

Expected: nenhuma linha de saída (zero erros).

- [ ] **Step 2: Subir backend**

```bash
cd /home/dev/workspace_ssh/geek-social-api
npm run dev &
```

- [ ] **Step 3: Subir frontend**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
npm run dev &
```

- [ ] **Step 4: Testar login**

Acessar `http://localhost:5173/login`. Logar com credenciais válidas.

Verificar no DevTools → Application → Local Storage: **não deve haver nenhum token**.

Verificar no DevTools → Application → Cookies: deve haver `refreshToken` (httpOnly, não legível pelo JS).

Verificar no DevTools → Network: requests às rotas protegidas devem ter `Authorization: Bearer <token>` no header.

- [ ] **Step 5: Testar persistência de sessão (page refresh)**

Com o usuário logado, recarregar a página (F5).

Expected: usuário permanece logado, vai direto para `/feed` sem passar pelo `/login`.

Verificar no Network: a primeira request após o carregamento é `POST /auth/refresh` (com o cookie sendo enviado automaticamente).

- [ ] **Step 6: Testar proteção de rota sem sessão**

Em aba anônima ou após limpar cookies, acessar `http://localhost:5173/feed` diretamente.

Expected: redireciona para `/login`.

- [ ] **Step 7: Testar logout**

Clicar em "Sair da conta" nas configurações.

Expected: redireciona para `/login`. Cookie `refreshToken` é removido pelo backend. Token em memória é limpo (store.token = null).

- [ ] **Step 8: Verificar segurança — localStorage limpo**

```javascript
// No console do browser após login:
localStorage.getItem('geek_social_token') // deve retornar null
Object.keys(localStorage).filter(k => k.includes('token')) // deve retornar []
```

Expected: sem tokens no localStorage.

- [ ] **Step 9: Commit final de verificação**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add -A
git commit -m "test: verify httpOnly cookie auth flow end-to-end"
```

---

## Resumo das mudanças de segurança

| Antes | Depois |
|-------|--------|
| `accessToken` em `localStorage` (vulnerável a XSS) | `accessToken` apenas em memória Pinia |
| Sem refresh automático (token expirado = logout) | Refresh silencioso via cookie httpOnly |
| `refreshToken` já era httpOnly ✓ | `refreshToken` httpOnly ✓ (sem mudança) |
| Guard do router verificava localStorage | Guard verifica Pinia store (já populado no startup) |
| Login/Register não chamavam `connectSocket` | `useAuth.login/register` garante socket conectado |
