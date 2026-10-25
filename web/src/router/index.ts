import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { defineComponent, h } from 'vue'
import WorldView from '../views/WorldView.vue'
import OrgView from '../views/OrgView.vue'
import CharView from '../views/CharView.vue'
import MeView from '../views/MeView.vue'
import LobbyView from '../views/LobbyView.vue'

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
  },
  {
    path: '/world/:id?',
    name: 'world',
    component: WorldView,
  },
  {
    path: '/org/:id?',
    name: 'org',
    component: OrgView,
  },
  {
    path: '/char/:id?',
    name: 'char',
    component: CharView,
  },
  {
    path: '/timeline',
    name: 'timeline',
    component: lazyView('TimelineView'),
  },
  {
    path: '/graph',
    name: 'graph',
    component: lazyView('GraphView'),
  },
  {
    path: '/templates',
    name: 'templates',
    component: lazyView('TemplatesView'),
  },
  {
    path: '/plots',
    name: 'plots',
    component: lazyView('PlotsView'),
  },
  {
    path: '/articles',
    name: 'articles',
    component: lazyView('ArticlesView'),
  },
  {
    path: '/scenes',
    name: 'scenes',
    component: lazyView('ScenesView'),
  },
  {
    path: '/glossary',
    name: 'glossary',
    component: lazyView('GlossaryView'),
  },
  {
    path: '/stats',
    name: 'stats',
    component: lazyView('StatsView'),
  },
  {
    path: '/me',
    name: 'me',
    component: MeView,
  },
  {
    path: '/lobby',
    name: 'lobby',
    component: LobbyView,
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
