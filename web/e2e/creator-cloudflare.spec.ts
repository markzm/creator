import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_FIXTURE, 'Run with npm run test:e2e:worker for an isolated seeded Worker/D1');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cc_tut_done', '1'); localStorage.setItem('cc_lang', 'zh'); localStorage.setItem('cc_dark', '0');
  });
});
async function login(page: any, baseURL: string | undefined, name: string) {
  await page.context().addCookies([{ name: 'creator_sid', value: `${name}-test-session`, url: baseURL! }]);
}

test('desktop lobby caps recent creators, pages full directory, searches server-side and loads details lazily', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const requests: string[] = []; page.on('request', req => { if (req.url().includes('/api/')) requests.push(req.url()); });
  await page.goto('/lobby');
  await expect(page.locator('.creator-cards .creator-row')).toHaveCount(8);
  await expect(page.locator('.creators-heading')).toContainText('500 人在线');
  await expect(page.locator('.lobby-card')).toHaveCount(30);
  expect(requests.filter(url => /\/api\/shares\//.test(url))).toHaveLength(0);
  await page.locator('.lobby-card').first().getByRole('button', { name: '阅读全文' }).click();
  await expect(page.getByText('完整正文49', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name: /全部创作者（1004）/ }).click();
  await expect(page.locator('.directory-grid .creator-row')).toHaveCount(20);
  const first = await page.locator('.directory-grid strong').first().textContent();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.directory-grid strong').first()).not.toHaveText(first!);
  await page.getByLabel('搜索创作者', { exact: true }).fill('创作者099');
  await expect(page.locator('.directory-grid .creator-row')).toHaveCount(10);
  await expect(page.locator('.directory-grid strong').first()).toContainText('创作者099');
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(page.locator('.directory-grid')).not.toBeVisible();
  await page.screenshot({ path: '../artifacts/e2e/lobby-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('mobile lobby collapses creators and avoids horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/lobby');
  await expect(page.locator('.creator-cards')).not.toBeVisible();
  await page.locator('.mobile-toggle').click(); await expect(page.locator('.creator-cards .creator-row')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../artifacts/e2e/lobby-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /全部创作者（1004）/ }).click();
  await expect(page.locator('.directory-grid .creator-row')).toHaveCount(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('prompt library freely edits, previews AI text before application and persists through reload', async ({ page, baseURL }) => {
  await login(page, baseURL, 'author'); await page.goto('/prompts');
  await page.getByRole('button', { name: '新建提示词' }).click();
  await page.getByLabel('标题', { exact: true }).fill('人物对话模板');
  await page.getByLabel('提示词正文', { exact: true }).fill('保留我的自由创作要求');
  await page.getByRole('button', { name: 'AI 生成提示词', exact: true }).click();
  await page.getByRole('button', { name: '生成草稿', exact: true }).click();
  await expect(page.getByLabel('AI 生成草稿')).toHaveValue('生成的创作草稿');
  await expect(page.getByLabel('提示词正文', { exact: true })).toHaveValue('保留我的自由创作要求');
  await page.getByLabel('AI 生成草稿').fill('作者编辑后的提示词');
  await page.getByRole('button', { name: '替换目标内容', exact: true }).click();
  await expect(page.getByLabel('提示词正文', { exact: true })).toHaveValue('作者编辑后的提示词');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.prompt-row')).toContainText('人物对话模板');
  await page.waitForTimeout(700); await page.reload();
  await page.locator('.prompt-row').filter({ hasText: '人物对话模板' }).click();
  await expect(page.getByLabel('提示词正文', { exact: true })).toHaveValue('作者编辑后的提示词');
});

test('super admin edits an independent buffer, retains drafts after 409, and saves private shares separately', async ({ page, baseURL }) => {
  await login(page, baseURL, 'owner'); await page.goto('/admin/content');
  await page.getByLabel('查找作者').fill('author@test.example');
  await expect(page.locator('.author-row')).toHaveCount(1); await page.locator('.author-row').click();
  await expect(page.locator('.content-record-list')).toContainText('作者未发布世界');
  const coreInput = page.getByLabel('一句话核心概念', { exact: true });
  await coreInput.fill('管理员缓冲区修改');
  const updated = await page.request.get('/api/admin/content/2/document'); const remote = await updated.json();
  remote.data.worlds.author_world.data.w_core = '作者同时修改';
  const author = await page.context().browser()!.newContext();
  try {
    await author.addCookies([{ name: 'creator_sid', value: 'author-test-session', url: baseURL! }]);
    expect((await author.request.put(baseURL + '/api/sync', { data: { baseRev: remote.rev, data: remote.data } })).status()).toBe(200);
  } finally { await author.close(); }
  await page.getByRole('button', { name: '保存设定集修改' }).click();
  await expect(page.getByRole('alert')).toContainText('你的修改已保留'); await expect(coreInput).toHaveValue('管理员缓冲区修改');
  const own = await (await page.request.get('/api/admin/content/1/document')).json();
  expect(own.data.worlds.own_world.data.w_core).toBe('管理员自己的设定');
  await page.getByRole('button', { name: '作品库（公开与私有）' }).click();
  // Select the private item through the paginated library.
  while (!(await page.locator('.content-record-list button').filter({ hasText: '作者私有作品' }).count())) {
    await page.getByRole('button', { name: '下一页', exact: true }).last().click();
    await page.waitForTimeout(100);
  }
  await page.locator('.content-record-list button').filter({ hasText: '作者私有作品' }).click();
  await page.getByLabel('正文', { exact: true }).fill('管理员更新的私有作品');
  await page.getByRole('button', { name: '保存作品修改' }).click();
  await expect(page.getByText('已保存作品；云端设定集保持独立', { exact: true })).toBeVisible();
  const share = await (await page.request.get('/api/shares/private_e2e')).json(); expect(share.share.content).toBe('管理员更新的私有作品');
});

test('ordinary admin is denied full-site management and private share endpoints', async ({ page, baseURL }) => {
  await login(page, baseURL, 'admin'); await page.goto('/admin/content');
  await expect(page).not.toHaveURL(/\/admin\/content/);
  expect((await page.request.get('/api/admin/content/2/document')).status()).toBe(403);
  expect((await page.request.get('/api/shares/private_e2e')).status()).toBe(403);
});

test('late feed and creator-search responses cannot replace newer results', async ({ page }) => {
  await page.route('**/api/shares?*', async route => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get('q') === '大厅文章1') await new Promise(resolve => setTimeout(resolve, 900));
    await route.fulfill({ response });
  });
  await page.route('**/api/lobby/users?*', async route => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get('q') === '创作者000') await new Promise(resolve => setTimeout(resolve, 900));
    await route.fulfill({ response });
  });
  await page.goto('/lobby');
  const oldFeed = page.waitForRequest(req => new URL(req.url()).searchParams.get('q') === '大厅文章1');
  await page.getByPlaceholder('搜索标题、摘要或标签…').fill('大厅文章1'); await oldFeed;
  await page.getByPlaceholder('搜索标题、摘要或标签…').fill('大厅文章2');
  await expect(page.locator('.lobby-card strong').first()).toHaveText('大厅文章29');
  await page.waitForTimeout(1000); await expect(page.locator('.lobby-card strong').first()).toHaveText('大厅文章29');
  await page.getByRole('button', { name: /全部创作者/ }).click();
  const oldCreators = page.waitForRequest(req => new URL(req.url()).searchParams.get('q') === '创作者000');
  await page.getByLabel('搜索创作者', { exact: true }).fill('创作者000'); await oldCreators;
  await page.getByLabel('搜索创作者', { exact: true }).fill('创作者099');
  await expect(page.locator('.directory-grid strong').first()).toHaveText('创作者0999');
  await page.waitForTimeout(1000); await expect(page.locator('.directory-grid strong').first()).toHaveText('创作者0999');
});
