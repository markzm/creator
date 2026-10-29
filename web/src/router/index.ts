import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { defineComponent, h } from 'vue'
import WorldView from '../views/WorldView.vue'
import OrgView from '../views/OrgView.vue'
import CharView from '../views/CharView.vue'
import MeView from '../views/MeView.vue'
import LobbyView from '../views/LobbyView.vue'
import { useAuthStore } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Guests are redirected to /welcome (with ?next=). */
    requiresAuth?: boolean
    /** Only site admins; others are sent home. */
    requiresAdmin?: boolean
    requiresSuperAdmin?: boolean
    /** Human-readable title for document.title. */
    title?: string
  }
}

const viewModules = import.meta.glob('../views/*.vue')

function lazyView(viewName: string) {
  const key = `../views/${viewName}.vue`
  const loader = viewModules[key]
  if (loader) {
    return loader
  }
  return () =>
    Promise.resolve(
      defineComponent({
        name: viewName,
        setup() {
          return () =>
            h('div', { class: 'p-4 text-muted text-sm' }, `${viewName} loading...`)
        },
      }),
    )
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: lazyView('DashboardView'),
    meta: { requiresAuth: true, title: '总览' },
  },
  {
    path: '/welcome',
    name: 'welcome',
    component: lazyView('LandingView'),
    meta: { title: '欢迎' },
  },
  {
    path: '/reset',
    name: 'reset-password',
    component: lazyView('ResetPasswordView'),
    meta: { title: '重置密码' },
  },
  { path: '/world/:id?', name: 'world', component: WorldView, meta: { title: '世界观' } },
  { path: '/org/:id?', name: 'org', component: OrgView, meta: { title: '组织' } },
  { path: '/char/:id?', name: 'char', component: CharView, meta: { title: '角色' } },
  { path: '/timeline', name: 'timeline', component: lazyView('TimelineView'), meta: { title: '时间线' } },
  { path: '/graph', name: 'graph', component: lazyView('GraphView'), meta: { title: '关系网' } },
  { path: '/templates', name: 'templates', component: lazyView('TemplatesView'), meta: { title: '模板' } },
  { path: '/plots', name: 'plots', component: lazyView('PlotsView'), meta: { title: '剧情线' } },
  { path: '/articles', name: 'articles', component: lazyView('ArticlesView'), meta: { title: '文章创作' } },
  { path: '/scenes', name: 'scenes', component: lazyView('ScenesView'), meta: { title: '场景卡' } },
  { path: '/glossary', name: 'glossary', component: lazyView('GlossaryView'), meta: { title: '术语表' } },
  { path: '/stats', name: 'stats', component: lazyView('StatsView'), meta: { title: '写作看板' } },
  { path: '/me', name: 'me', component: MeView, meta: { requiresAuth: true, title: '个人主页' } },
  { path: '/prompts', name: 'prompts', component: lazyView('PromptsView'), meta: { requiresAuth: true, title: '个人提示词库' } },
  { path: '/admin/content', name: 'admin-content', component: lazyView('AdminContentView'), meta: { requiresAuth: true, requiresSuperAdmin: true, title: '全站创作管理' } },
  { path: '/lobby', name: 'lobby', component: LobbyView, meta: { title: '创作大厅' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

/**
 * Guest gating lives here (not in each view): guests hitting an auth-only page land on the
 * welcome page and are sent back to `next` after signing in. Admin pages fall back home.
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // Wait for the initial session probe so a hard refresh on /me does not bounce a logged-in user.
  if (!auth.initialized) {
    await Promise.race([auth.whenReady(), new Promise((r) => setTimeout(r, 4000))])
  }
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'welcome', query: to.fullPath !== '/' ? { next: to.fullPath } : {} }
  }
  if (to.meta.requiresSuperAdmin && !auth.isSuperAdmin) return { path: '/' };
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'dashboard' }
  }
  if (to.name === 'welcome' && auth.isLoggedIn) {
    const next = typeof to.query.next === 'string' && to.query.next.startsWith('/') ? to.query.next : '/'
    return next
  }
  return true
})

router.afterEach((to) => {
  if (typeof document !== 'undefined') {
    const base = '设定创作器 · Worldbuilding Studio'
    document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
  }
})

export default router
