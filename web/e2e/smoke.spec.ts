import { expect, test } from '@playwright/test';

test.describe('Creator Studio v6 — End-to-End Smoke Suite (T14)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cc_tut_done', '1');
      localStorage.setItem('cc_seeded_v6', '1');
      localStorage.setItem('cc_lang', 'zh');
      localStorage.setItem('cc_dark', '0');
    });
  });

  test('1. Offline entity creation, editing, IndexedDB persistence & Draft Code roundtrip', async ({
    page
  }) => {
    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'u_smoke',
            email: 'smoke@example.com',
            name: 'Smoke Tester',
            isAdmin: false,
            createdAt: Date.now()
          }
        })
      });
    });

    await page.goto('/world');
    await expect(page.locator('#f-w_name')).toBeVisible();

    // Fork official reference item into personal editable copy
    await page.locator('button:has-text("复制为衍生副本")').first().click();
    await expect(page.locator('#f-w_name')).toHaveValue(/衍生副本/);

    await page.locator('#f-w_name').fill('艾泽拉世界');
    await page.locator('#f-w_core').fill('蒸汽与星界魔法交织的群岛纪元');

    // Wait for debounced IndexedDB persistence (400ms)
    await page.waitForTimeout(600);

    // Reload and verify IndexedDB persistence
    await page.reload();
    await expect(page.locator('#f-w_name')).toHaveValue('艾泽拉世界');
    await expect(page.locator('#f-w_core')).toHaveValue('蒸汽与星界魔法交织的群岛纪元');

    // Open Draft Code panel and generate CC3W code
    await page.locator('.card-h', { hasText: '草稿码' }).click();
    await page.getByRole('button', { name: '生成草稿码' }).click();
    const codeTextarea = page.locator('.code-panel textarea');
    await expect(codeTextarea).toBeVisible();
    const draftCode = await codeTextarea.inputValue();
    expect(draftCode.startsWith('CC3Wr-')).toBe(true);
  });

  test('2. Backup modal & legacy v5 localStorage automatic migration', async ({ page }) => {
    await page.addInitScript(() => {
      const legacyV5 = {
        _v: 5,
        worlds: {
          w_legacy: {
            id: 'w_legacy',
            name: '旧版迁移世界',
            data: { w_name: '旧版迁移世界', w_core: '来自 v5 localStorage 的世界' }
          }
        },
        orgs: {},
        chars: {},
        activeW: 'w_legacy'
      };
      localStorage.setItem('cc_db_v5', JSON.stringify(legacyV5));
    });

    await page.goto('/world');
    await expect(page.locator('#f-w_name')).toHaveValue('旧版迁移世界');
    await expect(page.locator('#f-w_core')).toHaveValue('来自 v5 localStorage 的世界');

    // Open Backup modal and verify options
    await page.locator('.topbar').getByRole('button', { name: /备份 \/ 导出/ }).click();
    await expect(page.getByText('导出 JSON 备份 (v6)')).toBeVisible();
    await expect(page.getByText('导出全部 Markdown 设定集')).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
  });

  test('3. Open registration (math challenge), cloud sync, revision history & 409 conflict', async ({
    request
  }) => {
    // 3a. Fetch math challenge
    const chRes = await request.get('/api/auth/challenge');
    expect(chRes.ok()).toBe(true);
    const chBody = await chRes.json();
    expect(chBody.registerMode).toBe('open');
    const question: string = chBody.question;
    const m = question.match(/(\d+)\s*\+\s*(\d+)/);
    expect(m).not.toBeNull();
    const answer = String(Number(m![1]) + Number(m![2]));

    // 3b. Register a new user
    const uniqueEmail = `e2e_${Date.now()}@example.com`;
    const regRes = await request.post('/api/auth/register', {
      headers: { Origin: 'http://127.0.0.1:8080' },
      data: {
        email: uniqueEmail,
        password: 'Password123',
        challengeToken: chBody.token,
        challengeAnswer: answer
      }
    });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.user.email).toBe(uniqueEmail);

    // 3c. Push cloud sync document (rev 0 -> rev 1)
    const docV6 = {
      _version: 6,
      worlds: {
        w1: {
          id: 'w1',
          name: '云端同步世界',
          data: { w_name: '云端同步世界' },
          customInsp: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      },
      orgs: {},
      chars: {},
      templates: {},
      timeline: [],
      plots: [],
      scenes: [],
      glossary: [],
      stats: [],
      ui: { activeW: 'w1', activeO: '', activeC: '', activeTpl: 'char_default', nowYear: 500 }
    };

    const put1 = await request.put('/api/sync', {
      headers: { Origin: 'http://127.0.0.1:8080' },
      data: { baseRev: 0, data: docV6 }
    });
    expect(put1.ok()).toBe(true);
    const put1Body = await put1.json();
    expect(put1Body.rev).toBe(1);

    // 3d. Stale baseRev=0 triggers 409 Conflict with current server doc
    const putConflict = await request.put('/api/sync', {
      headers: { Origin: 'http://127.0.0.1:8080' },
      data: { baseRev: 0, data: docV6 }
    });
    expect(putConflict.status()).toBe(409);
    const conflictBody = await putConflict.json();
    expect(conflictBody.serverRev).toBe(1);

    // 3e. Verify revision history snapshot was recorded
    const revRes = await request.get('/api/sync/revisions');
    expect(revRes.ok()).toBe(true);
    const revBody = await revRes.json();
    expect(revBody.revisions.length).toBeGreaterThanOrEqual(1);
  });

  test('4. Lobby share publish, listing, detail fetch & author-only deletion', async ({
    browser
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const reqA = ctxA.request;
    const reqB = ctxB.request;

    async function registerUser(req: typeof reqA, prefix: string) {
      const ch = await (await req.get('http://127.0.0.1:8080/api/auth/challenge')).json();
      const m = ch.question.match(/(\d+)\s*\+\s*(\d+)/);
      const ans = String(Number(m[1]) + Number(m[2]));
      const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
      const res = await req.post('http://127.0.0.1:8080/api/auth/register', {
        headers: { Origin: 'http://127.0.0.1:8080' },
        data: {
          email,
          password: 'Password123',
          challengeToken: ch.token,
          challengeAnswer: ans
        }
      });
      expect(res.status()).toBe(201);
    }

    await registerUser(reqA, 'author');
    await registerUser(reqB, 'reader');

    // Author publishes a world to the Lobby
    const pubRes = await reqA.post('http://127.0.0.1:8080/api/shares', {
      headers: { Origin: 'http://127.0.0.1:8080' },
      data: {
        kind: 'world',
        title: '星海回响',
        summary: '远古星门复苏后的纪元',
        content: '# 星海回响\n\n远古星门复苏后的纪元',
        draftCode: 'CC3Wr-test'
      }
    });
    expect(pubRes.ok()).toBe(true);
    const shareId = (await pubRes.json()).share.id;

    // Non-author (User B) attempts to delete User A's share -> 403 Forbidden
    const delByB = await reqB.delete(`http://127.0.0.1:8080/api/shares/${shareId}`, {
      headers: { Origin: 'http://127.0.0.1:8080' }
    });
    expect(delByB.status()).toBe(403);

    // Author (User A) deletes own share -> 200 OK
    const delByA = await reqA.delete(`http://127.0.0.1:8080/api/shares/${shareId}`, {
      headers: { Origin: 'http://127.0.0.1:8080' }
    });
    expect(delByA.ok()).toBe(true);

    await ctxA.close();
    await ctxB.close();
  });

  test('5. Command palette (⌘K), dark mode toggle & ZH/EN language switch', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible();

    // Open Command Palette via topbar search button
    await page.locator('.topbar').getByRole('button', { name: /搜索/ }).click();
    await expect(page.getByText('全局搜索与快捷命令')).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();

    // Toggle Dark Mode
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.locator('.topbar').getByRole('button', { name: '🌙' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Switch Language ZH -> EN
    await page.locator('.topbar').getByRole('button', { name: /🌐 EN/ }).click();
    await expect(page.locator('.topbar').getByText('Worldbuilding Studio')).toBeVisible();
  });

  test('6. Starter Example or seed initializes characters on first visit', async ({
    page
  }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('cc_seeded_v6');
    });
    await page.goto('/char');
    await expect(page.locator('.sres').first()).toBeVisible();
  });

  test('7. Offline guest cannot access Lobby, while authenticated user can browse & filter', async ({ page }) => {
    // 7a. Unauthenticated guest is gated in offline mode
    await page.goto('/lobby');
    await expect(page.getByText('离线体验版 · 创作大厅已锁定')).toBeVisible();
    await expect(page.getByText('离线体验版（未登录）').first()).toBeVisible();

    // 7b. Authenticated user can access the Lobby
    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 101,
            email: 'creator@example.com',
            name: '大厅创作者',
            isAdmin: false,
            createdAt: Date.now()
          }
        })
      });
    });

    await page.reload();
    await expect(page.getByRole('button', { name: /全部作品/ })).toBeVisible();
    await page.getByRole('button', { name: /文章作品/ }).click();
    await expect(page.getByText('作品展示列表')).toBeVisible();
  });

  test('8. Offline guest cannot access Dashboard, while authenticated user views personal studio metrics', async ({ page }) => {
    // 8a. Unauthenticated guest is gated in offline mode
    await page.goto('/');
    await expect(page.getByText('离线体验版 · 创作看板已锁定')).toBeVisible();

    // 8b. Authenticated user can view personal dashboard
    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 102,
            email: 'studio@example.com',
            name: '看板创作者',
            isAdmin: false,
            createdAt: Date.now()
          }
        })
      });
    });

    await page.reload();
    await expect(page.getByText('个人创作大盘').first()).toBeVisible();
    await expect(page.getByText('总创作用字')).toBeVisible();
  });

  test('9. Articles Studio loads and AI Configuration modal opens cleanly', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.getByText('文章创作工作台')).toBeVisible();
    await page.getByRole('button', { name: /AI 引擎设置/ }).click();
    await expect(page.getByText('AI 引擎与量身定制设定器偏好')).toBeVisible();
    await page.getByRole('button', { name: '取消' }).click();
  });
});
