import { expect, test, type Page } from '@playwright/test';
test.skip(!process.env.E2E_FIXTURE, 'Run with npm run test:e2e:worker');
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { localStorage.setItem('cc_tut_done', '1'); localStorage.setItem('cc_lang', 'zh'); localStorage.setItem('cc_dark', '0'); }); });
async function login(page: Page, baseURL: string | undefined) { await page.context().addCookies([{ name: 'creator_sid', value: 'reader-test-session', url: baseURL! }]); }
async function screenshot(page: Page, name: string) {
  await page.locator('.app-viewport').evaluate(element => element.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `../artifacts/e2e/${name}.png` });
}
async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function document(page: Page): Promise<any> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('keyval-store'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result; const get = db.transaction('keyval', 'readonly').objectStore('keyval').get('creator_doc_v6'); get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = () => { reject(get.error); db.close(); }; };
  }));
}
function personalCharacterIds(doc: any): string[] {
  return Object.values(doc.chars).filter((item: any) => !item.isReference).map((item: any) => item.id).sort();
}
test('welcome uses bounded static imagery and inspiration filters never request database content', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/welcome');
  await expect(page.locator('.landing-art img')).toBeVisible();
  await expect.poll(() => page.locator('.landing-art img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/inspiration/')).reduce((total, entry) => total + (entry as PerformanceResourceTiming).encodedBodySize, 0));
  expect(bytes).toBeLessThan(600 * 1024);
  await screenshot(page, 'welcome-desktop');
  await page.goto('/inspiration'); await expect(page.locator('.inspiration-card')).toHaveCount(12);
  await page.waitForTimeout(700);
  const calls: string[] = []; page.on('request', request => { if (request.url().includes('/api/')) calls.push(request.url()); });
  await page.getByRole('button', { name: '角色档案', exact: true }).click(); await expect(page.locator('.inspiration-card')).toHaveCount(4);
  await page.getByRole('button', { name: '科幻', exact: true }).click(); await expect(page.locator('.inspiration-card')).toHaveCount(2);
  await page.getByLabel('搜索灵感').fill('修理'); await expect(page.locator('.inspiration-card')).toHaveCount(1);
  await page.getByLabel('搜索灵感').fill(''); await page.getByRole('button', { name: '全部灵感', exact: true }).click(); await page.getByRole('button', { name: '全部题材', exact: true }).click();
  await page.locator('.inspiration-card').filter({ hasText: '霓虹熄灭' }).click(); await expect(page.getByRole('dialog')).toContainText('摄影参考');
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(calls).toEqual([]); expect(errors).toEqual([]);
  await screenshot(page, 'inspiration-desktop');
});
test('guest login returns to the chosen seed and cancelling a seed creates nothing', async ({ page }) => {
  await page.goto('/inspiration?item=forest-courier');
  await page.getByRole('button', { name: '以此开始创作' }).click();
  const auth = page.getByRole('dialog').filter({ hasText: '登录云端账号' }); await expect(auth).toBeVisible();
  await auth.locator('input[type=email]').fill('reader@test.example'); await auth.locator('input[type=password]').fill('TestPass123!');
  await auth.getByRole('button', { name: '登录', exact: true }).last().click();
  await expect(page.getByLabel('创作名称', { exact: true })).toBeVisible();
  const before = await document(page);
  await page.getByLabel('创作名称', { exact: true }).fill('不应保存的草稿');
  await page.getByRole('button', { name: '取消创建', exact: true }).click();
  const after = await document(page);
  expect(personalCharacterIds(after)).toEqual(personalCharacterIds(before));
  expect(Object.values(after.chars).some((item: any) => item.name === '不应保存的草稿')).toBe(false);
  await expect(page).toHaveURL(/item=forest-courier/);
});
test('character seed previews AI output and creates exactly one private character only on confirmation', async ({ page, baseURL }) => {
  await login(page, baseURL); await page.goto('/inspiration?item=forest-courier');
  await page.getByRole('button', { name: '以此开始创作' }).click();
  await page.getByLabel('创作名称', { exact: true }).fill('测试巡林信使');
  await page.getByLabel('创作种子', { exact: true }).fill('必须保留的手写种子');
  await expect(page.getByLabel('将原创插画作为角色参考立绘')).toBeChecked();
  const before = await document(page);
  await page.getByRole('button', { name: 'AI 扩写种子' }).click();
  await page.getByRole('button', { name: '生成草稿', exact: true }).click();
  await expect(page.getByLabel('AI 生成草稿')).toHaveValue('生成的创作草稿');
  await expect(page.getByLabel('创作种子', { exact: true })).toHaveValue('必须保留的手写种子');
  expect(Object.keys((await document(page)).chars)).toEqual(Object.keys(before.chars));
  await page.getByLabel('AI 生成草稿').fill('经作者修改后的创作种子');
  await page.getByRole('button', { name: '替换目标内容', exact: true }).click();
  await expect(page.getByLabel('创作种子', { exact: true })).toHaveValue('经作者修改后的创作种子');
  await page.getByRole('button', { name: '确认创建', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page).toHaveURL(/\/char\/ch_/);
  await expect.poll(async () => Object.values((await document(page)).chars).filter((item: any) => item.name === '测试巡林信使').length).toBe(1);
  const character: any = Object.values((await document(page)).chars).find((item: any) => item.name === '测试巡林信使');
  expect(character).toMatchObject({ visibility: 'private', inspirationId: 'forest-courier', data: { extra: '经作者修改后的创作种子' } });
  expect(character.tachiE).toBe(new URL('/inspiration/forest-courier-detail.webp', baseURL).href);
  await expect(page.locator('.inspiration-origin')).toContainText('替森林投递秘密的人');
  await page.reload(); await expect(page.locator('.inspiration-origin')).toContainText('替森林投递秘密的人');
});
test('scene and world seeds open their editors and preserve source references', async ({ page, baseURL }) => {
  await login(page, baseURL); await page.goto('/inspiration?item=misty-station');
  await page.getByRole('button', { name: '以此开始创作' }).click();
  await page.getByLabel('创作名称', { exact: true }).fill('雾中车站场景测试'); await page.getByRole('button', { name: '确认创建', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('编辑场景');
  await expect.poll(async () => (await document(page)).scenes.some((item: any) => item.title === '雾中车站场景测试' && item.inspirationId === 'misty-station')).toBe(true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.goto('/inspiration?item=sky-islands'); await page.getByRole('button', { name: '以此开始创作' }).click();
  await page.getByLabel('创建类型').selectOption('world'); await page.getByLabel('创作名称', { exact: true }).fill('浮岛世界测试');
  await page.getByRole('button', { name: '确认创建', exact: true }).click(); await expect(page).toHaveURL(/\/world\/wd_/);
  await expect(page.locator('.inspiration-origin')).toContainText('风停之前');
  const world: any = Object.values((await document(page)).worlds).find((item: any) => item.name === '浮岛世界测试');
  expect(world).toMatchObject({ visibility: 'private', inspirationId: 'sky-islands' });
});
test('mobile and dark layouts remain readable and failed images preserve usable cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/welcome');
  await expect(page.locator('.landing-art img')).toBeVisible();
  await expectNoOverflow(page);
  await screenshot(page, 'welcome-mobile');
  await page.goto('/inspiration');
  await expect(page.locator('.inspiration-card')).toHaveCount(12);
  await screenshot(page, 'inspiration-mobile');
  await page.getByRole('button', { name: '更多', exact: true }).click(); await expect(page.getByRole('dialog').getByText('创作灵感库')).toBeVisible(); await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.evaluate(() => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); });
  await page.setViewportSize({ width: 1280, height: 900 });
  await screenshot(page, 'inspiration-dark');
  await page.route('**/inspiration/mist-forest-*.webp', route => route.abort()); await page.reload();
  const card = page.locator('.inspiration-card').filter({ hasText: '雾散之前' }); await card.scrollIntoViewIfNeeded(); await expect(card.locator('.visual-fallback')).toBeVisible();
  await card.click(); await expect(page.getByRole('button', { name: '以此开始创作' })).toBeVisible();
  await expectNoOverflow(page);
});
test('tablet keeps two library columns and three dashboard suggestions, with keyboard-accessible nested dialogs', async ({ page, baseURL }) => {
  await login(page, baseURL);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/inspiration');
  const cards = page.locator('.inspiration-card');
  await expect(cards).toHaveCount(12);
  const boxes = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox(), cards.nth(2).boundingBox()]);
  expect(boxes[0]!.y).toBe(boxes[1]!.y);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
  await expectNoOverflow(page);
  await screenshot(page, 'inspiration-tablet');
  await cards.first().focus();
  await page.keyboard.press('Enter');
  const detail = page.getByRole('dialog').first();
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: '以此开始创作' }).click();
  await page.getByLabel('创作名称', { exact: true }).fill('键盘操作保留的草稿');
  await page.getByRole('button', { name: 'AI 扩写种子' }).click();
  const aiDialog = page.getByRole('dialog').filter({ hasText: '生成草稿' });
  await expect(aiDialog).toBeVisible();
  await expect.poll(() => aiDialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(aiDialog).not.toBeVisible();
  await expect(detail).toBeVisible();
  await expect(page.getByLabel('创作名称', { exact: true })).toHaveValue('键盘操作保留的草稿');
  await expect(page.getByRole('button', { name: 'AI 扩写种子' })).toBeFocused();
  await page.getByRole('button', { name: '取消创建', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await page.goto('/');
  await expect(page.locator('.shelf-grid .inspiration-card')).toHaveCount(3);
  await expect(page.locator('.shelf-grid .inspiration-card').last()).toBeVisible();
  await expectNoOverflow(page);
  await screenshot(page, 'dashboard-tablet');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, 'dashboard-desktop');
});
