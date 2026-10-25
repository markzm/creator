import { expect, test } from '@playwright/test';

test.describe('Official Reference Materials & Forking e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cc_tut_done', '1');
      localStorage.setItem('cc_lang', 'zh');
      localStorage.setItem('cc_dark', '0');
    });
  });

  test('visitor cannot edit official reference items and is prompted to sign in when clicking fork/create', async ({
    page
  }) => {
    await page.goto('/world');
    await expect(page.locator('#f-w_name')).toBeVisible();

    // 1. Unauthenticated visitor sees readonly attribute on reference fields
    await expect(page.locator('#f-w_name')).toHaveAttribute('readonly', '');
    await expect(page.locator('#f-w_core')).toHaveAttribute('readonly', '');

    // 2. Clear / dice / AI buttons should not be present for reference items
    await expect(page.locator('.clr-group')).toHaveCount(0);

    // 3. Official reference banner is shown
    await expect(page.locator('text=官方公共参考素材').first()).toBeVisible();

    // 4. Clicking "复制为衍生副本" prompts login and opens Auth modal
    const forkBtn = page.locator('button:has-text("复制为衍生副本")').first();
    await forkBtn.click();
    await expect(page.getByText('登录云端账号')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('请先登录个人账号');

    // Close modal
    await page.locator('.tut-mask').click({ position: { x: 10, y: 10 } });
    await expect(page.getByText('登录云端账号')).not.toBeVisible();

    // 5. Clicking "＋ 新建" also prompts login
    const createBtn = page.locator('button:has-text("新建")').first();
    await createBtn.click();
    await expect(page.getByText('登录云端账号')).toBeVisible();
  });

  test('authenticated user can fork official reference item into personal editable copy', async ({
    page
  }) => {
    // Mock authenticated user on /api/me
    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'u_tester',
            email: 'tester@example.com',
            name: '创作者测试员',
            isAdmin: false,
            createdAt: Date.now()
          }
        })
      });
    });

    await page.goto('/world');
    await expect(page.locator('#f-w_name')).toBeVisible();

    // Initial state: reference item is readonly
    await expect(page.locator('#f-w_name')).toHaveAttribute('readonly', '');

    // Click fork
    const forkBtn = page.locator('button:has-text("复制为衍生副本")').first();
    await forkBtn.click();

    // Should now have switched to the forked entity with "(衍生副本)" in title/name
    await expect(page.locator('#f-w_name')).toHaveValue(/衍生副本/);

    // Forked personal copy is editable (not readonly)
    await expect(page.locator('#f-w_name')).not.toHaveAttribute('readonly');
    await page.locator('#f-w_name').fill('我的专属星域');
    await expect(page.locator('#f-w_name')).toHaveValue('我的专属星域');
  });
});
