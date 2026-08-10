import { expect, test } from '@playwright/test'

test('the production document exposes the installable manifest', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  )
})

test('a parent can save and export a child answer', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      name: 'One question tonight. Their voice tomorrow.',
    }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Try tonight’s question' }).click()

  await page.getByLabel('Child’s first name or nickname').fill('Milo')
  await page.getByRole('radio', { name: '6 to 8' }).check()
  await page.getByRole('button', { name: 'Start our ritual' }).click()

  await expect(page.getByRole('heading', { name: 'Tonight’s question' })).toBeVisible()
  await page.getByLabel('Add their answer in words').fill('I learned how to whistle.')
  await page.getByRole('button', { name: 'Keep this answer' }).click()
  await expect(page.getByText('Saved to Milo’s timeline.')).toBeVisible()

  await page.getByRole('link', { name: 'Memories' }).click()
  await expect(page.getByRole('heading', { name: 'Milo’s growing timeline' })).toBeVisible()
  await expect(page.getByText('“I learned how to whistle.”')).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export my memories' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('before-they-grow-export.json')
  await expect(page.getByText('Your export was downloaded.')).toBeVisible()
})

test('the mobile experience stays within the viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only')
  await page.goto('/')

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)

  await page.getByRole('link', { name: 'Try tonight’s question' }).click()
  await expect(
    page.getByRole('heading', { name: 'Who are we listening to?' }),
  ).toBeVisible()
})
