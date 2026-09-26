import { expect, test } from '@playwright/test'
import { APP_READY, RELAYS, openApp, trackErrors } from './helpers'

test('home screen lists every app and the templates', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('.home')).toBeVisible()
  await expect(page.locator('.new-card')).toHaveCount(5)
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  expect(errors).toEqual([])
})

for (const app of Object.keys(APP_READY)) {
  test(`${app} opens a new document without errors`, async ({ page }) => {
    const errors = trackErrors(page)
    await openApp(page, app)
    await expect(page.locator('#doc-title')).toBeVisible()
    await expect(page.locator('#btn-share')).toBeVisible()
    // Let lazy chunks and workers settle.
    await page.waitForTimeout(1500)
    expect(errors).toEqual([])
  })
}

test('the UI follows the browser language', async ({ browser }) => {
  for (const [locale, fileMenu] of [['es-ES', 'Archivo'], ['gl-ES', 'Arquivo'], ['fr-FR', 'Fichier'], ['de-DE', 'Datei']]) {
    const context = await browser.newContext({ locale })
    const page = await context.newPage()
    await openApp(page, 'writer')
    await expect(page.locator('.menubar-item').first()).toHaveText(fileMenu)
    await context.close()
  }
})
