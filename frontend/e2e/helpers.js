import { expect } from '@playwright/test'

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

export async function openNewSheet(page) {
  await page.goto('/sheets')
  await expect(page.locator('#root')).toBeVisible()

  // Home.vue renders "New Spreadsheet" in two places — the empty-state
  // call-to-action and the topbar action. On a fresh test_site both are
  // in the DOM at once, which trips Playwright's strict-mode locator.
  // Either button fires the same emit('new'), so clicking the first one
  // is functionally equivalent.
  await page.getByRole('button', { name: /^New Spreadsheet$/ }).first().click()

  // Topbar visible isn't enough — keyboard shortcuts and toolbar handlers
  // bind inside the editor's mounted() chain. Wait for the toolbar (which
  // only mounts after the editor's compute pipeline is wired) before
  // letting tests interact with shortcuts.
  await expect(page.locator('.sn-topbar-right')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.sn-toolbar')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

// Drive `page.keyboard.press(mod+key)` against the document explicitly.
// Headless Chromium routes synthetic key events to the focused element;
// when that's `<html>`/`<body>` (the default after a goto+click), some
// keyboard events get dropped instead of bubbling to window listeners.
// Focusing body first guarantees a stable target.
export async function pressShortcut(page, combo) {
  await page.evaluate(() => document.body.focus?.())
  await page.keyboard.press(combo)
}
