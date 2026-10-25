import { expect, test } from '@playwright/test';

test.describe('Official Reference Materials & Forking e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cc_tut_done', '1');
      localStorage.setItem('cc_lang', 'zh');
      localStorage.setItem('cc_dark', '0');
    });
  });

  test('official reference items display badge and can be forked into personal copies', async ({ page }) => {
    await page.goto('/world');
    await expect(page.locator('#f-w_name')).toBeVisible();

    // Check entity list pane
    const listPane = page.locator('.entity-list-pane');
    await expect(listPane).toBeVisible();

    // Should display official reference pill
    const refPill = page.locator('.ref-pill').first();
    await expect(refPill).toBeVisible();

    // If active is reference, banner is visible
    const banner = page.locator('text=官方公共参考素材').first();
    await expect(banner).toBeVisible();

    // Fork button
    const forkBtn = page.locator('button:has-text("复制为衍生副本")').first();
    await forkBtn.click();

    // Should now have a new entity with "(衍生副本)" in title/name
    await expect(page.locator('#f-w_name')).toHaveValue(/衍生副本/);
  });
});
