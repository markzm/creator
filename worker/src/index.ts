import { Hono } from 'hono';
import { adminRouter } from './routes/admin';
import { aiRouter } from './routes/ai';
import { authRouter } from './routes/auth';
import { cocreationRouter } from './routes/cocreation';
import { meRouter } from './routes/me';
import { referenceRouter } from './routes/reference';
import { sharesRouter } from './routes/shares';
import { syncRouter } from './routes/sync';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Security Headers & CSRF Middleware for API routes
app.use('/api/*', async (c, next) => {
  const method = c.req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = c.req.header('origin');
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const reqUrl = new URL(c.req.url);
        const isSameHost = originUrl.host === reqUrl.host;
        const isLocal = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
        if (!isSameHost && !isLocal) {
          return c.json({ error: 'CSRF Origin check failed' }, 403);
        }
      } catch {
        return c.json({ error: 'Invalid origin header' }, 403);
      }
    }
  }

  await next();

  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// Health check
app.get('/api/healthz', (c) => {
  return c.json({
    status: 'ok',
    registerMode: c.env.REGISTER_MODE || 'open'
  });
});

// Mount API Routers
app.route('/api/auth', authRouter);
app.route('/api/me', meRouter);
app.route('/api/sync', syncRouter);
app.route('/api', sharesRouter);
app.route('/api/cocreation', cocreationRouter);
app.route('/api/admin', adminRouter);
app.route('/api', referenceRouter);
app.route('/api/ai', aiRouter);

// Avatar serving from Cloudflare R2
app.get('/avatars/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (!filename || filename === '.' || filename.includes('/')) {
    return c.text('Not found', 404);
  }

  if (c.env.AVATARS) {
    const object = await c.env.AVATARS.get(filename);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(object.body, { headers });
    }
  }

  return c.text('Avatar not found', 404);
});

// Catch-all API 404
app.all('/api/*', (c) => {
  return c.json({ error: 'API endpoint not found' }, 404);
});

// Fallback to static assets (Cloudflare Workers Assets / Pages) with SPA routing
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    let res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status === 404 && c.req.method === 'GET') {
      const url = new URL(c.req.url);
      url.pathname = '/index.html';
      res = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
    }
    return res;
  }
  return c.text('Static assets binding ASSETS not found', 500);
});

export default app;
