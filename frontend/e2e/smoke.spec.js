import { test, expect } from '@playwright/test'

test.describe('smoke', () => {
  test('app loads at /sheets and mounts #root', async ({ page }) => {
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/sheets')

    await expect(page.locator('#root')).toBeVisible()

    await expect(page.locator('.sn-mobile-blocker')).toBeHidden()

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0)
  })
})
