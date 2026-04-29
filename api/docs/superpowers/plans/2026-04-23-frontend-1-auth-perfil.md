# Frontend — Sub-projeto 1: Auth + Perfil

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o repositório `geek-social-frontend` com setup completo de Vue 3 + TypeScript + Tailwind v4, camada HTTP, auth via JWT, guards de rota, sidebar colapsável e telas de login, registro, esqueci senha, perfil e configurações.

**Architecture:** Arquitetura modular — `src/shared/` contém infraestrutura reutilizável (HTTP, auth, socket, UI primitivos) e `src/modules/auth/` contém toda a lógica do domínio de autenticação e perfil (views, composables, services, types). O estado global de auth é mantido em Pinia store; o axios interceptor injeta o token automaticamente em todas as requisições e redireciona em caso de 401.

**Tech Stack:** Vue 3 + TypeScript, Vite, Tailwind CSS v4, Pinia, Vue Router 4, Axios, vite-plugin-pwa

**Pré-requisito:** Nenhum — este é o primeiro sub-projeto.

---

## Estrutura de Arquivos

**Criar:**
```
geek-social-frontend/
├── .env.example
├── .gitignore
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
└── src/
    ├── main.ts
    ├── App.vue
    ├── style.css
    ├── shared/
    │   ├── http/
    │   │   └── api.ts
    │   ├── auth/
    │   │   ├── authStore.ts
    │   │   └── useAuth.ts
    │   ├── socket/
    │   │   └── useSocket.ts
    │   ├── types/
    │   │   └── auth.types.ts
    │   └── ui/
    │       ├── AppSidebar.vue
    │       ├── AppButton.vue
    │       ├── AppAvatar.vue
    │       └── AppBadge.vue
    ├── modules/
    │   └── auth/
    │       ├── types.ts
    │       ├── services/
    │       │   ├── authService.ts
    │       │   └── usersService.ts
    │       ├── composables/
    │       │   └── useProfile.ts
    │       └── views/
    │           ├── LoginView.vue
    │           ├── RegisterView.vue
    │           ├── ForgotPasswordView.vue
    │           ├── ProfileView.vue
    │           └── SettingsView.vue
    └── router/
        └── index.ts
```

---

## Task 1: Setup do repositório

**Diretório de trabalho:** pasta pai onde o repo será criado (ex.: `/home/dev/workspace_ssh/`)

- [ ] **Step 1: Criar projeto Vite**

```bash
cd /home/dev/workspace_ssh
npm create vite@latest geek-social-frontend -- --template vue-ts
cd geek-social-frontend
```

Output esperado: pasta `geek-social-frontend/` criada com estrutura base do template `vue-ts`.

- [ ] **Step 2: Instalar dependências de produção**

```bash
npm install pinia vue-router@4 axios socket.io-client lucide-vue-next
```

Output esperado: `node_modules/` populado, `package.json` com todas as deps listadas.

- [ ] **Step 3: Instalar dependências de desenvolvimento**

```bash
npm install -D tailwindcss@next @tailwindcss/vite vite-plugin-pwa
```

Output esperado: `@tailwindcss/vite` e `vite-plugin-pwa` em `devDependencies`.

- [ ] **Step 4: Configurar `vite.config.ts`**

Substituir o conteúdo de `vite.config.ts` por:

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Geek Social',
        short_name: 'GeekSocial',
        theme_color: '#0f0f1a',
        background_color: '#0f0f1a',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
```

- [ ] **Step 5: Criar `src/style.css` com design system via `@theme {}`**

Substituir `src/style.css` por:

```css
@import "tailwindcss";

@theme {
  --color-bg-base: #0f0f1a;
  --color-bg-surface: #1a1b2e;
  --color-bg-card: #1e2038;
  --color-bg-elevated: #252640;
  --color-text-primary: #e2e8f0;
  --color-text-secondary: #94a3b8;
  --color-text-muted: #475569;
  --color-accent-amber: #f59e0b;
  --color-accent-blue: #60a5fa;
  --color-accent-purple: #a78bfa;
  --color-status-online: #22c55e;
  --color-danger: #ef4444;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: Inter, system-ui, sans-serif;
  min-height: 100vh;
}

#app {
  min-height: 100vh;
}
```

- [ ] **Step 6: Criar `.env.example`**

```
VITE_API_URL=http://localhost:3000
```

Copiar para `.env`:

```bash
cp .env.example .env
```

- [ ] **Step 7: Limpar boilerplate do Vite**

Deletar `src/components/HelloWorld.vue` e `src/assets/vue.svg`:

```bash
rm -f src/components/HelloWorld.vue src/assets/vue.svg src/assets/javascript.svg
```

Substituir `src/App.vue` por um placeholder mínimo (será reescrito na Task 5):

```vue
<template>
  <RouterView />
</template>

<script setup lang="ts">
</script>
```

Substituir `src/main.ts` por:

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

- [ ] **Step 8: Verificar que o servidor sobe sem erros**

```bash
npm run dev
```

Output esperado: `VITE v5.x.x  ready in Xms — Local: http://localhost:5173/` sem erros no terminal.

- [ ] **Step 9: Init git e primeiro commit**

```bash
git init
echo "node_modules/\ndist/\n.env\n*.local" > .gitignore
git add .
git commit -m "chore: setup inicial — Vue 3 + TypeScript + Tailwind v4 + Vite"
```

---

## Task 2: Shared HTTP layer

**Files:**
- Criar: `src/shared/http/api.ts`
- Criar: `src/shared/types/auth.types.ts`

- [ ] **Step 1: Criar interfaces TypeScript em `src/shared/types/auth.types.ts`**

```typescript
export interface User {
  id: string
  displayName: string
  email: string
  username: string
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  isPrivate: boolean
  createdAt: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  displayName: string
  email: string
  password: string
}

export interface UpdateProfilePayload {
  displayName?: string
  bio?: string
  isPrivate?: boolean
}

export interface PublicProfile extends User {
  collectionsCount: number
  itemsCount: number
  friendsCount: number
  postsCount: number
  isFriend?: boolean
  friendRequestSent?: boolean
}

export interface ApiError {
  message: string
  statusCode: number
}
```

- [ ] **Step 2: Criar instância Axios em `src/shared/http/api.ts`**

```typescript
import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios'

const TOKEN_KEY = 'geek_social_token'

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Injeta Authorization header em todas as requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Trata 401 (token expirado) e 403 (sem permissão)
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      // Evitar redirect loop se já estiver em /login
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export { TOKEN_KEY }
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/
git commit -m "feat: shared HTTP layer — axios instance + interceptors + auth types"
```

---

## Task 3: Shared Auth composable + Pinia store

**Files:**
- Criar: `src/shared/auth/authStore.ts`
- Criar: `src/shared/auth/useAuth.ts`

- [ ] **Step 1: Criar Pinia store em `src/shared/auth/authStore.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/shared/types/auth.types'
import { TOKEN_KEY } from '@/shared/http/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))

  const isAuthenticated = computed(() => !!token.value)

  function setAuth(newToken: string, newUser: User) {
    token.value = newToken
    user.value = newUser
    localStorage.setItem(TOKEN_KEY, newToken)
  }

  function clearAuth() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  return { user, token, isAuthenticated, setAuth, clearAuth }
})
```

- [ ] **Step 2: Criar composable `src/shared/auth/useAuth.ts`**

```typescript
import { useAuthStore } from './authStore'
import { api } from '@/shared/http/api'
import type { LoginPayload, RegisterPayload, AuthResponse, User } from '@/shared/types/auth.types'
import { useRouter } from 'vue-router'

export function useAuth() {
  const store = useAuthStore()
  const router = useRouter()

  async function login(payload: LoginPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/login', payload)
    store.setAuth(data.token, data.user)
  }

  async function register(payload: RegisterPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/register', payload)
    store.setAuth(data.token, data.user)
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      store.clearAuth()
      router.push('/login')
    }
  }

  async function loadUser(): Promise<void> {
    if (!store.token) return
    try {
      const { data } = await api.get<User>('/users/me')
      store.user = data
    } catch {
      store.clearAuth()
    }
  }

  return {
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    login,
    register,
    logout,
    loadUser,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/auth/
git commit -m "feat: auth store (Pinia) + useAuth composable"
```

---

## Task 4: Vue Router + Route Guards

**Files:**
- Criar: `src/router/index.ts`
- Criar: placeholders para todas as views (para que lazy-load não quebre)

- [ ] **Step 1: Criar views placeholder para evitar erros no router**

Criar os arquivos com conteúdo mínimo — serão preenchidos nas tasks seguintes:

`src/modules/auth/views/LoginView.vue`:
```vue
<template><div>Login</div></template>
<script setup lang="ts"></script>
```

`src/modules/auth/views/RegisterView.vue`:
```vue
<template><div>Register</div></template>
<script setup lang="ts"></script>
```

`src/modules/auth/views/ForgotPasswordView.vue`:
```vue
<template><div>Forgot Password</div></template>
<script setup lang="ts"></script>
```

`src/modules/auth/views/ProfileView.vue`:
```vue
<template><div>Profile</div></template>
<script setup lang="ts"></script>
```

`src/modules/auth/views/SettingsView.vue`:
```vue
<template><div>Settings</div></template>
<script setup lang="ts"></script>
```

Criar também um placeholder de feed (para o redirect `/`):

`src/modules/feed/views/FeedView.vue`:
```vue
<template><div class="p-8 text-[--color-text-primary]">Feed — em breve</div></template>
<script setup lang="ts"></script>
```

- [ ] **Step 2: Criar `src/router/index.ts`**

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import { TOKEN_KEY } from '@/shared/http/api'

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
    },
    {
      path: '/profile/:username',
      name: 'profile',
      component: () => import('@/modules/auth/views/ProfileView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/modules/auth/views/SettingsView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/feed',
    },
  ],
})

// Guard global: rotas privadas exigem token
router.beforeEach((to) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!to.meta.public && !token) {
    return { name: 'login' }
  }
  // Usuário autenticado não precisa ver login/register
  if (to.meta.public && token) {
    return { name: 'feed' }
  }
})

export default router
```

- [ ] **Step 3: Commit**

```bash
git add src/router/ src/modules/
git commit -m "feat: vue-router com rotas lazy-loaded + navigation guard JWT"
```

---

## Task 5: AppSidebar + UI primitivos + App.vue layout

**Files:**
- Criar: `src/shared/ui/AppSidebar.vue`
- Criar: `src/shared/ui/AppButton.vue`
- Criar: `src/shared/ui/AppAvatar.vue`
- Criar: `src/shared/ui/AppBadge.vue`
- Modificar: `src/App.vue`

- [ ] **Step 1: Criar `src/shared/ui/AppBadge.vue`**

```vue
<template>
  <span
    v-if="count > 0"
    :class="[
      'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white',
      variant === 'danger' ? 'bg-[--color-danger]' : 'bg-[--color-accent-amber]',
    ]"
  >
    {{ count > 99 ? '99+' : count }}
  </span>
</template>

<script setup lang="ts">
defineProps<{
  count: number
  variant?: 'danger' | 'amber'
}>()
</script>
```

- [ ] **Step 2: Criar `src/shared/ui/AppAvatar.vue`**

```vue
<template>
  <div
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="relative rounded-full overflow-hidden flex-shrink-0"
  >
    <img
      v-if="src"
      :src="src"
      :alt="name"
      class="w-full h-full object-cover"
    />
    <div
      v-else
      class="w-full h-full flex items-center justify-center bg-[--color-bg-elevated] text-[--color-text-secondary] font-semibold"
      :style="{ fontSize: `${Math.floor(size * 0.38)}px` }"
    >
      {{ initials }}
    </div>
    <!-- Indicador de status online -->
    <span
      v-if="showStatus"
      class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[--color-status-online] border-2 border-[--color-bg-surface]"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  src?: string | null
  name: string
  size?: number
  showStatus?: boolean
}>(), {
  src: null,
  size: 36,
  showStatus: false,
})

const initials = computed(() => {
  return props.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})
</script>
```

- [ ] **Step 3: Criar `src/shared/ui/AppButton.vue`**

```vue
<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[--color-bg-base] disabled:opacity-50 disabled:cursor-not-allowed',
      variantClasses[variant],
    ]"
    v-bind="$attrs"
  >
    <span v-if="loading" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  disabled?: boolean
}>(), {
  variant: 'primary',
  type: 'button',
  loading: false,
  disabled: false,
})

const variantClasses = {
  primary: 'bg-[--color-accent-amber] text-[#0f0f1a] hover:brightness-110 focus:ring-[--color-accent-amber]',
  ghost: 'bg-transparent text-[--color-text-secondary] hover:bg-[--color-bg-elevated] hover:text-[--color-text-primary] focus:ring-[--color-text-muted]',
  danger: 'bg-[--color-danger] text-white hover:brightness-110 focus:ring-[--color-danger]',
}
</script>
```

- [ ] **Step 4: Criar `src/shared/ui/AppSidebar.vue`**

```vue
<template>
  <aside
    :class="[
      'flex flex-col h-screen sticky top-0 bg-[--color-bg-surface] border-r border-[--color-bg-elevated] transition-all duration-200 flex-shrink-0',
      'w-[52px] lg:w-[220px]',
    ]"
  >
    <!-- Logo -->
    <div class="flex items-center gap-3 px-3 py-4 lg:px-4 border-b border-[--color-bg-elevated]">
      <div class="w-8 h-8 rounded-lg bg-[--color-accent-amber] flex items-center justify-center flex-shrink-0">
        <Gamepad2 :size="18" class="text-[#0f0f1a]" />
      </div>
      <span class="hidden lg:block font-bold text-[--color-text-primary] text-lg leading-none">Geek Social</span>
    </div>

    <!-- Nav items -->
    <nav class="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          @click="navigate"
          :class="[
            'w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors duration-150 group relative',
            isActive
              ? 'bg-[--color-accent-amber]/10 text-[--color-accent-amber]'
              : 'text-[--color-text-secondary] hover:bg-[--color-bg-elevated] hover:text-[--color-text-primary]',
          ]"
        >
          <component :is="item.icon" :size="20" class="flex-shrink-0" />
          <span class="hidden lg:block text-sm font-medium truncate">{{ item.label }}</span>
          <!-- Badge -->
          <AppBadge
            v-if="item.badge && item.badge > 0"
            :count="item.badge"
            variant="danger"
            class="ml-auto hidden lg:inline-flex"
          />
          <!-- Badge visível no modo colapsado (sobre o ícone) -->
          <AppBadge
            v-if="item.badge && item.badge > 0"
            :count="item.badge"
            variant="danger"
            class="absolute top-1 right-1 lg:hidden"
          />
        </button>
      </RouterLink>
    </nav>

    <!-- Rodapé: usuário -->
    <div class="border-t border-[--color-bg-elevated] p-2">
      <RouterLink to="/settings">
        <div class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[--color-bg-elevated] transition-colors cursor-pointer">
          <AppAvatar
            :src="user?.avatarUrl"
            :name="user?.displayName ?? 'User'"
            :size="32"
            :show-status="true"
          />
          <div class="hidden lg:block overflow-hidden">
            <p class="text-sm font-medium text-[--color-text-primary] truncate">{{ user?.displayName }}</p>
            <p class="text-xs text-[--color-status-online]">Online</p>
          </div>
        </div>
      </RouterLink>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Home, Library, Users, MessageSquare, Bell, Gamepad2 } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import AppAvatar from './AppAvatar.vue'
import AppBadge from './AppBadge.vue'

const store = useAuthStore()
const user = computed(() => store.user)

// Badges virão de stores de chat/notificações (sub-projetos futuros)
const navItems = [
  { to: '/feed', label: 'Feed', icon: Home, badge: 0 },
  { to: '/collections', label: 'Coleções', icon: Library, badge: 0 },
  { to: '/friends', label: 'Amigos', icon: Users, badge: 0 },
  { to: '/chat', label: 'Chat', icon: MessageSquare, badge: 0 },
  { to: '/notifications', label: 'Notificações', icon: Bell, badge: 0 },
]
</script>
```

- [ ] **Step 5: Reescrever `src/App.vue` com layout raiz**

```vue
<template>
  <div class="flex min-h-screen bg-[--color-bg-base]">
    <!-- Sidebar: oculta nas rotas públicas -->
    <AppSidebar v-if="showSidebar" />

    <!-- Conteúdo principal -->
    <main class="flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/shared/auth/authStore'
import AppSidebar from '@/shared/ui/AppSidebar.vue'

const route = useRoute()
const store = useAuthStore()

const publicRoutes = ['/login', '/register', '/forgot-password']

const showSidebar = computed(() => {
  return store.isAuthenticated && !publicRoutes.some((r) => route.path.startsWith(r))
})
</script>
```

- [ ] **Step 6: Testar no browser**

```bash
npm run dev
```

Acessar `http://localhost:5173/login` — deve renderizar a rota pública sem sidebar. Acessar `/feed` sem token — deve redirecionar para `/login`.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ui/ src/App.vue
git commit -m "feat: AppSidebar colapsável + AppButton + AppAvatar + AppBadge + layout raiz"
```

---

## Task 6: Auth services + LoginView

**Files:**
- Criar: `src/modules/auth/services/authService.ts`
- Modificar: `src/modules/auth/views/LoginView.vue`

- [ ] **Step 1: Criar `src/modules/auth/services/authService.ts`**

```typescript
import { api } from '@/shared/http/api'
import type { AuthResponse, LoginPayload, RegisterPayload } from '@/shared/types/auth.types'

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', payload)
  return data
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', payload)
  return data
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/auth/reset-password', { token, password })
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}
```

- [ ] **Step 2: Substituir `src/modules/auth/views/LoginView.vue`**

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-[--color-bg-base] p-4">
    <div class="w-full max-w-md">
      <!-- Logo + título -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[--color-accent-amber] mb-4">
          <Gamepad2 :size="28" class="text-[#0f0f1a]" />
        </div>
        <h1 class="text-2xl font-bold text-[--color-text-primary]">Geek Social</h1>
        <p class="text-[--color-text-secondary] mt-1 text-sm">Bem-vindo de volta, jogador</p>
      </div>

      <!-- Card do formulário -->
      <div class="bg-[--color-bg-card] rounded-2xl p-6 shadow-xl border border-[--color-bg-elevated]">
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <!-- Email -->
          <div class="flex flex-col gap-1.5">
            <label for="email" class="text-sm font-medium text-[--color-text-secondary]">E-mail</label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="seu@email.com"
              required
              :class="[
                'w-full px-3 py-2.5 rounded-lg bg-[--color-bg-elevated] border text-[--color-text-primary] placeholder-[--color-text-muted] text-sm focus:outline-none focus:ring-2 transition-colors',
                fieldError('email')
                  ? 'border-[--color-danger] focus:ring-[--color-danger]/30'
                  : 'border-transparent focus:border-[--color-accent-amber] focus:ring-[--color-accent-amber]/20',
              ]"
            />
            <p v-if="fieldError('email')" class="text-xs text-[--color-danger]">{{ fieldError('email') }}</p>
          </div>

          <!-- Senha -->
          <div class="flex flex-col gap-1.5">
            <label for="password" class="text-sm font-medium text-[--color-text-secondary]">Senha</label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••"
                required
                :class="[
                  'w-full px-3 py-2.5 pr-10 rounded-lg bg-[--color-bg-elevated] border text-[--color-text-primary] placeholder-[--color-text-muted] text-sm focus:outline-none focus:ring-2 transition-colors',
                  fieldError('password')
                    ? 'border-[--color-danger] focus:ring-[--color-danger]/30'
                    : 'border-transparent focus:border-[--color-accent-amber] focus:ring-[--color-accent-amber]/20',
                ]"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-[--color-text-muted] hover:text-[--color-text-secondary]"
              >
                <Eye v-if="!showPassword" :size="16" />
                <EyeOff v-else :size="16" />
              </button>
            </div>
          </div>

          <!-- Erro geral -->
          <p v-if="generalError" class="text-sm text-[--color-danger] text-center bg-[--color-danger]/10 rounded-lg px-3 py-2">
            {{ generalError }}
          </p>

          <!-- Link esqueci senha -->
          <div class="text-right -mt-2">
            <RouterLink to="/forgot-password" class="text-xs text-[--color-accent-amber] hover:underline">
              Esqueci minha senha
            </RouterLink>
          </div>

          <!-- Botão submit -->
          <AppButton type="submit" variant="primary" :loading="loading" class="w-full mt-1">
            Entrar
          </AppButton>
        </form>

        <!-- Link para registro -->
        <p class="text-center text-sm text-[--color-text-muted] mt-4">
          Ainda não tem conta?
          <RouterLink to="/register" class="text-[--color-accent-amber] hover:underline font-medium">
            Criar conta
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Gamepad2, Eye, EyeOff } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import AppButton from '@/shared/ui/AppButton.vue'
import * as authService from '../services/authService'

const router = useRouter()
const store = useAuthStore()

const form = reactive({ email: '', password: '' })
const loading = ref(false)
const generalError = ref('')
const showPassword = ref(false)
const errors = reactive<Record<string, string>>({})

function fieldError(field: string) {
  return errors[field] ?? ''
}

async function handleSubmit() {
  generalError.value = ''
  Object.keys(errors).forEach((k) => delete errors[k])
  loading.value = true

  try {
    const result = await authService.login({ email: form.email, password: form.password })
    store.setAuth(result.token, result.user)
    router.push('/feed')
  } catch (err: any) {
    const status = err.response?.status
    const message = err.response?.data?.message ?? 'Erro ao fazer login. Tente novamente.'
    if (status === 401) {
      generalError.value = 'E-mail ou senha incorretos.'
    } else {
      generalError.value = message
    }
  } finally {
    loading.value = false
  }
}
</script>
```

- [ ] **Step 3: Testar no browser**

```bash
npm run dev
```

Acessar `http://localhost:5173/login`. Verificar: formulário renderiza com fundo escuro, campo de senha com toggle, botão amber. Tentar login com credenciais erradas — deve mostrar erro inline.

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/services/authService.ts src/modules/auth/views/LoginView.vue
git commit -m "feat: authService + LoginView com validação e erro inline"
```

---

## Task 7: RegisterView

**Files:**
- Modificar: `src/modules/auth/views/RegisterView.vue`

- [ ] **Step 1: Substituir `src/modules/auth/views/RegisterView.vue`**

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-[--color-bg-base] p-4">
    <div class="w-full max-w-md">
      <!-- Logo + título -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[--color-accent-amber] mb-4">
          <Gamepad2 :size="28" class="text-[#0f0f1a]" />
        </div>
        <h1 class="text-2xl font-bold text-[--color-text-primary]">Criar conta</h1>
        <p class="text-[--color-text-secondary] mt-1 text-sm">Junte-se à comunidade geek</p>
      </div>

      <div class="bg-[--color-bg-card] rounded-2xl p-6 shadow-xl border border-[--color-bg-elevated]">
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <!-- Nome de exibição -->
          <div class="flex flex-col gap-1.5">
            <label for="displayName" class="text-sm font-medium text-[--color-text-secondary]">Nome de exibição</label>
            <input
              id="displayName"
              v-model="form.displayName"
              type="text"
              autocomplete="name"
              placeholder="Seu nome na plataforma"
              required
              minlength="2"
              maxlength="50"
              :class="inputClass('displayName')"
            />
            <p v-if="errors.displayName" class="text-xs text-[--color-danger]">{{ errors.displayName }}</p>
          </div>

          <!-- E-mail -->
          <div class="flex flex-col gap-1.5">
            <label for="email" class="text-sm font-medium text-[--color-text-secondary]">E-mail</label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="seu@email.com"
              required
              :class="inputClass('email')"
            />
            <p v-if="errors.email" class="text-xs text-[--color-danger]">{{ errors.email }}</p>
          </div>

          <!-- Senha -->
          <div class="flex flex-col gap-1.5">
            <label for="password" class="text-sm font-medium text-[--color-text-secondary]">Senha</label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Mínimo 8 caracteres"
                required
                :class="inputClass('password') + ' pr-10'"
              />
              <button type="button" @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-[--color-text-muted] hover:text-[--color-text-secondary]">
                <Eye v-if="!showPassword" :size="16" />
                <EyeOff v-else :size="16" />
              </button>
            </div>
            <p v-if="errors.password" class="text-xs text-[--color-danger]">{{ errors.password }}</p>
          </div>

          <!-- Confirmar senha -->
          <div class="flex flex-col gap-1.5">
            <label for="confirmPassword" class="text-sm font-medium text-[--color-text-secondary]">Confirmar senha</label>
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="Repita a senha"
              required
              :class="inputClass('confirmPassword')"
            />
            <p v-if="errors.confirmPassword" class="text-xs text-[--color-danger]">{{ errors.confirmPassword }}</p>
          </div>

          <!-- Erro geral -->
          <p v-if="generalError" class="text-sm text-[--color-danger] text-center bg-[--color-danger]/10 rounded-lg px-3 py-2">
            {{ generalError }}
          </p>

          <AppButton type="submit" variant="primary" :loading="loading" class="w-full mt-1">
            Criar conta
          </AppButton>
        </form>

        <p class="text-center text-sm text-[--color-text-muted] mt-4">
          Já tem conta?
          <RouterLink to="/login" class="text-[--color-accent-amber] hover:underline font-medium">
            Entrar
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Gamepad2, Eye, EyeOff } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import AppButton from '@/shared/ui/AppButton.vue'
import * as authService from '../services/authService'

const router = useRouter()
const store = useAuthStore()

const form = reactive({ displayName: '', email: '', password: '', confirmPassword: '' })
const loading = ref(false)
const generalError = ref('')
const showPassword = ref(false)
const errors = reactive<Record<string, string>>({})

function inputClass(field: string): string {
  const base = 'w-full px-3 py-2.5 rounded-lg bg-[--color-bg-elevated] border text-[--color-text-primary] placeholder-[--color-text-muted] text-sm focus:outline-none focus:ring-2 transition-colors'
  return errors[field]
    ? `${base} border-[--color-danger] focus:ring-[--color-danger]/30`
    : `${base} border-transparent focus:border-[--color-accent-amber] focus:ring-[--color-accent-amber]/20`
}

function validate(): boolean {
  let valid = true
  Object.keys(errors).forEach((k) => delete errors[k])

  if (form.displayName.trim().length < 2) {
    errors.displayName = 'Nome deve ter pelo menos 2 caracteres.'
    valid = false
  }
  if (form.password.length < 8) {
    errors.password = 'Senha deve ter pelo menos 8 caracteres.'
    valid = false
  }
  if (form.password !== form.confirmPassword) {
    errors.confirmPassword = 'As senhas não coincidem.'
    valid = false
  }
  return valid
}

async function handleSubmit() {
  if (!validate()) return
  generalError.value = ''
  loading.value = true

  try {
    const result = await authService.register({
      displayName: form.displayName.trim(),
      email: form.email,
      password: form.password,
    })
    store.setAuth(result.token, result.user)
    router.push('/feed')
  } catch (err: any) {
    generalError.value = err.response?.data?.message ?? 'Erro ao criar conta. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/auth/views/RegisterView.vue
git commit -m "feat: RegisterView com validação de senha e campos inline"
```

---

## Task 8: ForgotPasswordView

**Files:**
- Modificar: `src/modules/auth/views/ForgotPasswordView.vue`

- [ ] **Step 1: Substituir `src/modules/auth/views/ForgotPasswordView.vue`**

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-[--color-bg-base] p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[--color-bg-elevated] mb-4">
          <KeyRound :size="28" class="text-[--color-accent-amber]" />
        </div>
        <h1 class="text-2xl font-bold text-[--color-text-primary]">Recuperar senha</h1>
        <p class="text-[--color-text-secondary] mt-1 text-sm">
          Enviaremos um link de recuperação para o seu e-mail
        </p>
      </div>

      <div class="bg-[--color-bg-card] rounded-2xl p-6 shadow-xl border border-[--color-bg-elevated]">
        <!-- Formulário -->
        <form v-if="!sent" @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="email" class="text-sm font-medium text-[--color-text-secondary]">E-mail</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="seu@email.com"
              required
              class="w-full px-3 py-2.5 rounded-lg bg-[--color-bg-elevated] border border-transparent text-[--color-text-primary] placeholder-[--color-text-muted] text-sm focus:outline-none focus:ring-2 focus:border-[--color-accent-amber] focus:ring-[--color-accent-amber]/20 transition-colors"
            />
          </div>

          <p v-if="error" class="text-sm text-[--color-danger] text-center bg-[--color-danger]/10 rounded-lg px-3 py-2">
            {{ error }}
          </p>

          <AppButton type="submit" variant="primary" :loading="loading" class="w-full">
            Enviar link de recuperação
          </AppButton>
        </form>

        <!-- Mensagem de sucesso -->
        <div v-else class="text-center py-4">
          <div class="w-12 h-12 rounded-full bg-[--color-status-online]/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle :size="28" class="text-[--color-status-online]" />
          </div>
          <p class="text-[--color-text-primary] font-medium">Link enviado!</p>
          <p class="text-[--color-text-secondary] text-sm mt-1">
            Verifique sua caixa de entrada em <span class="text-[--color-accent-amber]">{{ email }}</span>
          </p>
        </div>

        <p class="text-center text-sm text-[--color-text-muted] mt-4">
          <RouterLink to="/login" class="text-[--color-accent-amber] hover:underline font-medium">
            Voltar para o login
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { KeyRound, CheckCircle } from 'lucide-vue-next'
import AppButton from '@/shared/ui/AppButton.vue'
import * as authService from '../services/authService'

const email = ref('')
const loading = ref(false)
const error = ref('')
const sent = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    await authService.forgotPassword(email.value)
    sent.value = true
  } catch (err: any) {
    error.value = err.response?.data?.message ?? 'Erro ao enviar e-mail. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/auth/views/ForgotPasswordView.vue
git commit -m "feat: ForgotPasswordView com feedback de sucesso"
```

---

## Task 9: ProfileView

**Files:**
- Criar: `src/modules/auth/services/usersService.ts`
- Criar: `src/modules/auth/composables/useProfile.ts`
- Modificar: `src/modules/auth/views/ProfileView.vue`

- [ ] **Step 1: Criar `src/modules/auth/services/usersService.ts`**

```typescript
import { api } from '@/shared/http/api'
import type { PublicProfile, UpdateProfilePayload } from '@/shared/types/auth.types'

export async function getProfile(userId: string): Promise<PublicProfile> {
  const { data } = await api.get<PublicProfile>(`/users/${userId}/profile`)
  return data
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<void> {
  await api.put('/users/me/profile', payload)
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<{ avatarUrl: string }>('/users/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteAvatar(): Promise<void> {
  await api.delete('/users/me/avatar')
}

export async function uploadCover(file: File): Promise<{ coverUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<{ coverUrl: string }>('/users/me/cover', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteCover(): Promise<void> {
  await api.delete('/users/me/cover')
}
```

- [ ] **Step 2: Criar `src/modules/auth/composables/useProfile.ts`**

```typescript
import { ref, computed } from 'vue'
import { useAuthStore } from '@/shared/auth/authStore'
import type { PublicProfile } from '@/shared/types/auth.types'
import * as usersService from '../services/usersService'

export function useProfile(userId: string) {
  const store = useAuthStore()
  const profile = ref<PublicProfile | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isOwnProfile = computed(() => store.user?.id === userId)

  async function fetchProfile() {
    loading.value = true
    error.value = null
    try {
      profile.value = await usersService.getProfile(userId)
    } catch (err: any) {
      error.value = err.response?.data?.message ?? 'Erro ao carregar perfil.'
    } finally {
      loading.value = false
    }
  }

  async function handleAvatarUpload(file: File) {
    const result = await usersService.uploadAvatar(file)
    if (store.user) {
      store.user.avatarUrl = result.avatarUrl
    }
    if (profile.value) {
      profile.value.avatarUrl = result.avatarUrl
    }
  }

  async function handleCoverUpload(file: File) {
    const result = await usersService.uploadCover(file)
    if (store.user) {
      store.user.coverUrl = result.coverUrl
    }
    if (profile.value) {
      profile.value.coverUrl = result.coverUrl
    }
  }

  return {
    profile,
    loading,
    error,
    isOwnProfile,
    fetchProfile,
    handleAvatarUpload,
    handleCoverUpload,
  }
}
```

- [ ] **Step 3: Substituir `src/modules/auth/views/ProfileView.vue`**

```vue
<template>
  <div class="min-h-screen bg-[--color-bg-base]">
    <!-- Loading skeleton -->
    <div v-if="loading" class="animate-pulse">
      <div class="h-40 bg-[--color-bg-elevated]" />
      <div class="max-w-4xl mx-auto px-4 pt-4">
        <div class="h-6 bg-[--color-bg-elevated] rounded w-40 mt-16 mb-2" />
        <div class="h-4 bg-[--color-bg-elevated] rounded w-64" />
      </div>
    </div>

    <!-- Erro -->
    <div v-else-if="error" class="max-w-4xl mx-auto px-4 py-20 text-center">
      <p class="text-[--color-danger]">{{ error }}</p>
    </div>

    <!-- Perfil -->
    <template v-else-if="profile">
      <!-- Banner de capa -->
      <div class="relative h-40 bg-gradient-to-br from-[--color-accent-purple]/40 to-[--color-accent-blue]/30 overflow-hidden">
        <img
          v-if="profile.coverUrl"
          :src="profile.coverUrl"
          alt="Capa do perfil"
          class="w-full h-full object-cover"
        />
        <!-- Botão upload capa (só perfil próprio) -->
        <label
          v-if="isOwnProfile"
          class="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 hover:bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
        >
          <Camera :size="14" />
          Alterar capa
          <input type="file" accept="image/*" class="hidden" @change="onCoverChange" />
        </label>
      </div>

      <!-- Seção avatar + info -->
      <div class="max-w-4xl mx-auto px-4">
        <div class="flex items-end justify-between -mt-12 mb-4">
          <!-- Avatar com botão de upload -->
          <div class="relative">
            <AppAvatar
              :src="profile.avatarUrl"
              :name="profile.displayName"
              :size="88"
              class="ring-4 ring-[--color-bg-base]"
            />
            <label
              v-if="isOwnProfile"
              class="absolute bottom-0 right-0 w-7 h-7 bg-[--color-accent-amber] rounded-full flex items-center justify-center cursor-pointer hover:brightness-110 transition-all"
            >
              <Camera :size="13" class="text-[#0f0f1a]" />
              <input type="file" accept="image/*" class="hidden" @change="onAvatarChange" />
            </label>
          </div>

          <!-- Ações -->
          <div class="mb-2">
            <RouterLink v-if="isOwnProfile" to="/settings">
              <AppButton variant="ghost" class="gap-2">
                <Settings :size="15" />
                Editar perfil
              </AppButton>
            </RouterLink>
          </div>
        </div>

        <!-- Nome + username + bio -->
        <div class="mb-6">
          <h1 class="text-xl font-bold text-[--color-text-primary]">{{ profile.displayName }}</h1>
          <p class="text-[--color-text-muted] text-sm">@{{ profile.username }}</p>
          <p v-if="profile.bio" class="mt-2 text-[--color-text-secondary] text-sm max-w-lg">{{ profile.bio }}</p>
          <div v-if="profile.isPrivate" class="mt-2 flex items-center gap-1.5 text-xs text-[--color-text-muted]">
            <Lock :size="12" />
            Perfil privado
          </div>
        </div>

        <!-- Stats -->
        <div class="flex gap-6 mb-6 border-b border-[--color-bg-elevated] pb-6">
          <div class="text-center">
            <p class="text-lg font-bold text-[--color-text-primary]">{{ profile.collectionsCount }}</p>
            <p class="text-xs text-[--color-text-muted]">Coleções</p>
          </div>
          <div class="text-center">
            <p class="text-lg font-bold text-[--color-text-primary]">{{ profile.itemsCount }}</p>
            <p class="text-xs text-[--color-text-muted]">Itens</p>
          </div>
          <div class="text-center">
            <p class="text-lg font-bold text-[--color-text-primary]">{{ profile.friendsCount }}</p>
            <p class="text-xs text-[--color-text-muted]">Amigos</p>
          </div>
          <div class="text-center">
            <p class="text-lg font-bold text-[--color-text-primary]">{{ profile.postsCount }}</p>
            <p class="text-xs text-[--color-text-muted]">Posts</p>
          </div>
        </div>

        <!-- Abas -->
        <div class="flex gap-1 mb-6 border-b border-[--color-bg-elevated]">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-[--color-accent-amber] text-[--color-accent-amber]'
                : 'border-transparent text-[--color-text-muted] hover:text-[--color-text-secondary]',
            ]"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Conteúdo das abas (preenchido nos sub-projetos seguintes) -->
        <div class="pb-12">
          <div class="text-center py-16 text-[--color-text-muted]">
            <p class="text-sm">Conteúdo de <strong>{{ tabs.find(t => t.id === activeTab)?.label }}</strong> disponível em breve.</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Camera, Settings, Lock } from 'lucide-vue-next'
import AppAvatar from '@/shared/ui/AppAvatar.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import { useProfile } from '../composables/useProfile'

const route = useRoute()

const userId = route.params.username as string
const { profile, loading, error, isOwnProfile, fetchProfile, handleAvatarUpload, handleCoverUpload } = useProfile(userId)

const activeTab = ref('feed')
const tabs = [
  { id: 'feed', label: 'Feed' },
  { id: 'collections', label: 'Coleções' },
  { id: 'friends', label: 'Amigos' },
]

onMounted(fetchProfile)

watch(() => route.params.username, (newId) => {
  if (newId) fetchProfile()
})

async function onAvatarChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await handleAvatarUpload(file)
}

async function onCoverChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await handleCoverUpload(file)
}
</script>
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/services/usersService.ts src/modules/auth/composables/ src/modules/auth/views/ProfileView.vue
git commit -m "feat: usersService + useProfile composable + ProfileView com banner, avatar e stats"
```

---

## Task 10: SettingsView

**Files:**
- Modificar: `src/modules/auth/views/SettingsView.vue`

- [ ] **Step 1: Substituir `src/modules/auth/views/SettingsView.vue`**

```vue
<template>
  <div class="min-h-screen bg-[--color-bg-base] py-8 px-4">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-xl font-bold text-[--color-text-primary] mb-6">Configurações</h1>

      <!-- Card: Perfil -->
      <div class="bg-[--color-bg-card] rounded-2xl p-6 border border-[--color-bg-elevated] mb-6">
        <h2 class="text-base font-semibold text-[--color-text-primary] mb-4">Informações do perfil</h2>

        <!-- Avatar upload -->
        <div class="flex items-center gap-4 mb-6">
          <div class="relative">
            <AppAvatar
              :src="avatarPreview ?? user?.avatarUrl"
              :name="user?.displayName ?? 'User'"
              :size="72"
            />
            <label class="absolute bottom-0 right-0 w-6 h-6 bg-[--color-accent-amber] rounded-full flex items-center justify-center cursor-pointer hover:brightness-110 transition-all">
              <Camera :size="12" class="text-[#0f0f1a]" />
              <input type="file" accept="image/*" class="hidden" @change="onAvatarPreview" />
            </label>
          </div>
          <div>
            <p class="text-sm text-[--color-text-primary] font-medium">Foto de perfil</p>
            <p class="text-xs text-[--color-text-muted] mt-0.5">JPG, PNG ou WebP. Máx. 5MB.</p>
            <AppButton
              v-if="avatarFile"
              variant="primary"
              :loading="uploadingAvatar"
              class="mt-2 text-xs px-3 py-1.5"
              @click="saveAvatar"
            >
              Salvar foto
            </AppButton>
          </div>
        </div>

        <!-- Formulário de perfil -->
        <form @submit.prevent="saveProfile" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-[--color-text-secondary]">Nome de exibição</label>
            <input
              v-model="form.displayName"
              type="text"
              maxlength="50"
              placeholder="Seu nome na plataforma"
              class="w-full px-3 py-2.5 rounded-lg bg-[--color-bg-elevated] border border-transparent text-[--color-text-primary] placeholder-[--color-text-muted] text-sm focus:outline-none focus:ring-2 focus:border-[--color-accent-amber] focus:ring-[--color-accent-amber]/20 transition-colors"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-[--color-text-secondary]">Bio</label>
            <textarea
              v-model="form.bio"
              rows="3"
              maxlength="160"
              placeholder="Conte um pouco sobre você..."
              class="w-full px-3 py-2.5 rounded-lg bg-[--color-bg-elevated] border border-transparent text-[--color-text-primary] placeholder-[--color-text-muted] text-sm focus:outline-none focus:ring-2 focus:border-[--color-accent-amber] focus:ring-[--color-accent-amber]/20 transition-colors resize-none"
            />
            <p class="text-xs text-[--color-text-muted] text-right">{{ form.bio?.length ?? 0 }}/160</p>
          </div>

          <div class="flex items-center gap-3">
            <input
              id="isPrivate"
              v-model="form.isPrivate"
              type="checkbox"
              class="w-4 h-4 rounded accent-[--color-accent-amber]"
            />
            <label for="isPrivate" class="text-sm text-[--color-text-secondary]">
              Perfil privado — apenas amigos podem ver meu conteúdo
            </label>
          </div>

          <p v-if="profileSuccess" class="text-sm text-[--color-status-online] bg-[--color-status-online]/10 rounded-lg px-3 py-2">
            Perfil atualizado com sucesso!
          </p>
          <p v-if="profileError" class="text-sm text-[--color-danger] bg-[--color-danger]/10 rounded-lg px-3 py-2">
            {{ profileError }}
          </p>

          <div class="flex justify-end">
            <AppButton type="submit" variant="primary" :loading="savingProfile">
              Salvar alterações
            </AppButton>
          </div>
        </form>
      </div>

      <!-- Card: Sair -->
      <div class="bg-[--color-bg-card] rounded-2xl p-6 border border-[--color-bg-elevated]">
        <h2 class="text-base font-semibold text-[--color-text-primary] mb-2">Sessão</h2>
        <p class="text-sm text-[--color-text-muted] mb-4">Encerrar a sessão neste dispositivo.</p>
        <AppButton variant="danger" @click="handleLogout">
          Sair da conta
        </AppButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Camera } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import AppAvatar from '@/shared/ui/AppAvatar.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import * as usersService from '../services/usersService'
import * as authService from '../services/authService'
import { useRouter } from 'vue-router'

const store = useAuthStore()
const router = useRouter()
const user = computed(() => store.user)

const form = reactive({
  displayName: '',
  bio: '',
  isPrivate: false,
})

onMounted(() => {
  if (user.value) {
    form.displayName = user.value.displayName
    form.bio = user.value.bio ?? ''
    form.isPrivate = user.value.isPrivate
  }
})

// Avatar
const avatarPreview = ref<string | null>(null)
const avatarFile = ref<File | null>(null)
const uploadingAvatar = ref(false)

function onAvatarPreview(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  avatarFile.value = file
  avatarPreview.value = URL.createObjectURL(file)
}

async function saveAvatar() {
  if (!avatarFile.value) return
  uploadingAvatar.value = true
  try {
    const result = await usersService.uploadAvatar(avatarFile.value)
    if (store.user) store.user.avatarUrl = result.avatarUrl
    avatarFile.value = null
  } finally {
    uploadingAvatar.value = false
  }
}

// Perfil
const savingProfile = ref(false)
const profileSuccess = ref(false)
const profileError = ref('')

async function saveProfile() {
  savingProfile.value = true
  profileSuccess.value = false
  profileError.value = ''
  try {
    await usersService.updateProfile({
      displayName: form.displayName,
      bio: form.bio,
      isPrivate: form.isPrivate,
    })
    if (store.user) {
      store.user.displayName = form.displayName
      store.user.bio = form.bio
      store.user.isPrivate = form.isPrivate
    }
    profileSuccess.value = true
    setTimeout(() => { profileSuccess.value = false }, 3000)
  } catch (err: any) {
    profileError.value = err.response?.data?.message ?? 'Erro ao salvar perfil.'
  } finally {
    savingProfile.value = false
  }
}

// Logout
async function handleLogout() {
  try {
    await authService.logout()
  } finally {
    store.clearAuth()
    router.push('/login')
  }
}
</script>
```

- [ ] **Step 2: Testar no browser**

Com um token válido no localStorage, acessar `http://localhost:5173/settings`. Verificar: sidebar visível, formulário com dados preenchidos, checkbox de perfil privado, botão de sair.

- [ ] **Step 3: Commit final**

```bash
git add src/modules/auth/views/SettingsView.vue
git commit -m "feat: SettingsView com edição de perfil, upload de avatar e logout"
```

---

## Checklist de conclusão

- [ ] `npm run dev` sobe sem erros
- [ ] `/login` renderiza sem sidebar, com formulário dark soft
- [ ] `/register` tem validação de senha (≥8 chars, senhas iguais)
- [ ] `/forgot-password` mostra mensagem de sucesso após submit
- [ ] Sidebar aparece apenas em rotas autenticadas
- [ ] Sidebar colapsa para 52px em viewport < 1024px
- [ ] `/profile/:username` exibe banner, avatar, stats e abas
- [ ] `/settings` permite editar displayName, bio e isPrivate
- [ ] Navigation guard redireciona `/feed` → `/login` sem token
- [ ] Axios injeta `Authorization: Bearer <token>` em todas as requests
- [ ] 401 da API limpa token e redireciona para `/login`
- [ ] 10 commits limpos no histórico
