import { test, expect, type Page } from '@playwright/test';

test.skip(!process.env.E2E_FIXTURE, 'Run with npm run test:e2e:worker');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cc_tut_done', 'true');
    localStorage.setItem('cc_lang', '"zh"');
    if (localStorage.getItem('cc_dark') === null) localStorage.setItem('cc_dark', 'false');
  });
});
async function openAppearance(page: Page) {
  await page.locator('.topbar').getByRole('button', { name: '外观与套装', exact: true }).click();
  return page.getByRole('dialog', { name: '外观与套装', exact: true });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => {
    const viewport = document.querySelector('.app-viewport')!;
    return document.documentElement.scrollWidth <= innerWidth && viewport.scrollWidth <= viewport.clientWidth;
  })).toBe(true);
}
async function capture(page: Page, name: string) {
  await page.locator('.app-viewport').evaluate(el => el.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: '../artifacts/e2e/' + name + '.png' });
}

test('skin, color mode and ornaments persist independently without changing creative content', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/welcome');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'classic');
  const dialog = await openAppearance(page);
  const apiWrites: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) apiWrites.push(request.url());
  });
  await dialog.getByRole('radio', { name: /绯月档案/ }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'anime');
  await expect(page.locator('html')).toHaveClass(/light/);
  await dialog.getByText('深色 · 永夜', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await capture(page, 'appearance-picker');
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('.landing-title')).toContainText('由你改写世界线');
  await expect(page.locator('.studio-atmosphere')).toBeVisible();
  await noOverflow(page);
  await capture(page, 'anime-welcome-desktop');
  expect(apiWrites).toEqual([]);
  await page.goto('/inspiration');
  await expect(page.locator('.inspiration-card')).toHaveCount(12);
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'anime');
  await capture(page, 'anime-inspiration-dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'anime');
  await expect(page.locator('html')).toHaveClass(/dark/);
  const restored = await openAppearance(page);
  await restored.getByRole('checkbox', { name: /星图装饰/ }).uncheck();
  await expect(page.locator('.studio-atmosphere')).toHaveCount(0);
  await restored.getByText('浅色 · 白昼', { exact: true }).click();
  await restored.getByRole('button', { name: '完成', exact: true }).click();
  await capture(page, 'anime-inspiration-light');
  await page.reload();
  await expect(page.locator('.studio-atmosphere')).toHaveCount(0);
  const finalDialog = await openAppearance(page);
  await finalDialog.getByRole('radio', { name: /灵感手札/ }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'classic');
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.keyboard.press('Escape');
  await expect(finalDialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile appearance entry, reduced motion and main creative pages remain usable', async ({ page, baseURL }) => {
  // Visual checks must not change the shared online-count fixture used by lobby tests.
  await page.route('**/api/presence', route => route.fulfill({ json: { ok: true } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.context().addCookies([{ name: 'creator_sid', value: 'reader-test-session', url: baseURL! }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inspiration');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /外观与套装/ }).click();
  const dialog = page.getByRole('dialog', { name: '外观与套装', exact: true });
  await dialog.getByText('绯月档案', { exact: true }).click();
  await dialog.getByText('深色 · 永夜', { exact: true }).click();
  await capture(page, 'appearance-mobile');
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await noOverflow(page);
  await capture(page, 'anime-inspiration-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [path, name] of [['/', 'dashboard'], ['/char', 'character'], ['/world', 'world'], ['/articles', 'articles'], ['/graph', 'graph'], ['/lobby', 'lobby']] as const) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'anime');
    await expect(page.locator('.app-viewport')).toBeVisible();
    await noOverflow(page);
    await capture(page, 'anime-' + name + '-desktop');
  }
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/inspiration');
  await noOverflow(page);
  await capture(page, 'anime-inspiration-tablet');
});
