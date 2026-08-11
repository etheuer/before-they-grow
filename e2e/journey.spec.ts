import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function captureEvidence(page: Page, projectName: string, state: string) {
  const directory = resolve('docs/evidence/ux-redesign')
  await mkdir(directory, { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve(directory, `${projectName}-${state}.png`),
  })
}

test('the production document exposes the installable manifest', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  )
})

test('a saved dark preference is applied before the application bundle runs', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'), 'no-flash probe runs once')
  await page.addInitScript(() => {
    localStorage.setItem('before-they-grow-appearance', 'dark')
  })
  await page.route('**/assets/*.js', (route) => route.abort())

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(22, 21, 18)')
})

test('denied appearance reads use the system theme before the bundle runs', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'), 'no-flash denial probe runs once')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => {
    const actualGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function getItemWithDeniedAppearance(key: string) {
      if (key === 'before-they-grow-appearance') throw new DOMException('denied', 'SecurityError')
      return actualGetItem.call(this, key)
    }
  })
  await page.route('**/assets/*.js', (route) => route.abort())

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(22, 21, 18)')
})

test('public routes survive denied appearance storage', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'), 'storage-denial probe runs once')
  await page.addInitScript(() => {
    const actualGetItem = Storage.prototype.getItem
    const actualSetItem = Storage.prototype.setItem
    Storage.prototype.getItem = function getItemWithDeniedAppearance(key: string) {
      if (key === 'before-they-grow-appearance') throw new DOMException('denied', 'SecurityError')
      return actualGetItem.call(this, key)
    }
    Storage.prototype.setItem = function setItemWithDeniedAppearance(key: string, value: string) {
      if (key === 'before-they-grow-appearance') throw new DOMException('full', 'QuotaExceededError')
      return actualSetItem.call(this, key, value)
    }
  })

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'One question tonight. Their voice tomorrow.' }),
  ).toBeVisible()
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible()
})

test('an IndexedDB bootstrap failure renders recovery and succeeds on retry', async ({ page }) => {
  await page.addInitScript(() => {
    const actualOpen = IDBFactory.prototype.open
    let failNextOpen = true
    IDBFactory.prototype.open = function openWithOneFailure(
      name: string,
      version?: number,
    ): IDBOpenDBRequest {
      if (failNextOpen) {
        failNextOpen = false
        throw new DOMException('Access to IndexedDB is denied', 'SecurityError')
      }
      return version === undefined
        ? actualOpen.call(this, name)
        : actualOpen.call(this, name, version)
    }
  })

  await page.goto('/app')
  await expect(page.getByRole('alert')).toContainText('We could not open your local family data.')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Who are we listening to?' })).toBeVisible()
})

test('a parent can review, edit, save, and export a voice transcript', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    class BrowserTestMediaRecorder {
      static isTypeSupported() {
        return true
      }

      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: ((event: BlobEvent) => void) | null = null
      onstop: (() => void) | null = null

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        window.setTimeout(() => {
          this.ondataavailable?.({
            data: new Blob(['family-voice'], { type: 'audio/webm' }),
          } as BlobEvent)
          this.onstop?.()
        }, 150)
      }
    }

    class BrowserTestSpeechRecognition {
      continuous = false
      interimResults = false
      lang = ''
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null

      start() {}

      stop() {
        this.onresult?.({
          results: Object.assign(
            [{ 0: { transcript: 'I learned how to wistle.' }, isFinal: true }],
            { item: () => null },
          ),
        })
        this.onend?.()
      }

      abort() {
        this.onend?.()
      }
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => undefined }],
        }),
      },
    })
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: BrowserTestMediaRecorder,
    })
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: BrowserTestSpeechRecognition,
    })
    HTMLMediaElement.prototype.play = function play() {
      this.dispatchEvent(new Event('play'))
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event('pause'))
    }
  })

  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      name: 'One question tonight. Their voice tomorrow.',
    }),
  ).toBeVisible()
  await captureEvidence(page, testInfo.project.name, 'marketing')
  await page.getByRole('link', { name: 'Try tonight’s question' }).first().click()
  await captureEvidence(page, testInfo.project.name, 'onboarding')

  await page.getByLabel('Child’s first name or nickname').fill('Milo')
  await expect(page.getByRole('button', { name: 'Start our ritual' })).toBeDisabled()
  await page.getByRole('radio', { name: '6 to 8' }).check()
  await page.getByRole('button', { name: 'Start our ritual' }).click()

  await expect(page.getByRole('heading', { name: 'Tonight’s question' })).toBeVisible()
  await expect(page.getByLabel('Review the transcript')).toHaveCount(0)
  await captureEvidence(page, testInfo.project.name, 'ready')
  const readyRecordButton = page.getByRole('button', { name: 'Record an answer' })
  const readyRecordTop = await readyRecordButton.evaluate(
    (button) => button.getBoundingClientRect().top,
  )
  await readyRecordButton.click()
  await expect(page.getByRole('status')).toContainText('Recording 00:00')
  const recordingButtonTop = await page.getByRole('button', { name: 'Finish recording' }).evaluate(
    (button) => button.getBoundingClientRect().top,
  )
  expect(Math.abs(recordingButtonTop - readyRecordTop)).toBeLessThanOrEqual(1)
  await captureEvidence(page, testInfo.project.name, 'recording')
  await page.getByRole('button', { name: 'Finish recording' }).click()
  const processingStatus = page.getByRole('status').filter({ hasText: 'Preparing your answer…' })
  await expect(processingStatus).toBeVisible()
  const processingTop = await processingStatus.evaluate(
    (status) => status.getBoundingClientRect().top,
  )
  expect(Math.abs(processingTop - readyRecordTop)).toBeLessThanOrEqual(1)

  const transcript = page.getByLabel('Review the transcript')
  await expect(transcript).toHaveValue('I learned how to wistle.')
  await transcript.fill('I learned how to whistle.')
  await captureEvidence(page, testInfo.project.name, 'review')
  const saveAnswer = page.getByRole('button', { name: 'Save voice and transcript' })
  if (testInfo.project.name.includes('mobile')) {
    await saveAnswer.scrollIntoViewIfNeeded()
    const overlapsNavigation = await saveAnswer.evaluate((button) => {
      const navigation = document.querySelector('.app-header nav')
      if (!navigation) return false
      const buttonBox = button.getBoundingClientRect()
      const navigationBox = navigation.getBoundingClientRect()
      return buttonBox.bottom > navigationBox.top && buttonBox.top < navigationBox.bottom
    })
    expect(overlapsNavigation).toBe(false)
  }
  await saveAnswer.click()
  await expect(page.getByText('Saved to Milo’s memories.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play this memory' })).toBeVisible()
  await page.getByRole('button', { name: 'Play this memory' }).click()
  await expect(page.getByRole('button', { name: 'Pause this memory' })).toBeVisible()
  await captureEvidence(page, testInfo.project.name, 'saved')

  await page.getByRole('link', { name: 'Memories', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Milo’s memories' })).toBeVisible()
  await expect(page.getByText('“I learned how to whistle.”')).toBeVisible()
  const currentMonth = await page.evaluate(() =>
    new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date()),
  )
  await expect(page.getByRole('heading', { name: currentMonth })).toBeVisible()
  await captureEvidence(page, testInfo.project.name, 'memories')

  await page.getByRole('link', { name: 'Settings' }).click()
  await captureEvidence(page, testInfo.project.name, 'settings')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download a backup' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('before-they-grow-export.json')
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
    memories: Array<{
      answerText: string
      audio: null | { mimeType: string; dataBase64: string }
    }>
  }
  expect(exported.memories).toHaveLength(1)
  expect(exported.memories[0].answerText).toBe('I learned how to whistle.')
  expect(exported.memories[0].audio?.mimeType).toBe('audio/webm')
  expect(Buffer.from(exported.memories[0].audio?.dataBase64 ?? '', 'base64').toString()).toBe(
    'family-voice',
  )
  await expect(page.getByText('Your export was downloaded.')).toBeVisible()
  await page.getByRole('radio', { name: 'Dark' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await captureEvidence(page, testInfo.project.name, 'dark')
})

test('the mobile experience stays within the viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only')
  await page.goto('/')

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)

  await page.getByRole('link', { name: 'Try tonight’s question' }).first().click()
  await expect(
    page.getByRole('heading', { name: 'Who are we listening to?' }),
  ).toBeVisible()
  for (const target of [
    page.getByRole('link', { name: 'Before They Grow' }),
    page.getByRole('link', { name: 'Learn more' }),
  ]) {
    const box = await target.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

test('core routes stay contained across the supported viewport matrix', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'), 'viewport matrix runs once')

  await page.goto('/app')
  await page.getByLabel('Child’s first name or nickname').fill('Milo')
  await page.getByRole('radio', { name: '6 to 8' }).check()
  await page.getByRole('button', { name: 'Start our ritual' }).click()

  const viewports = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]
  const routes = ['/', '/app', '/app/memories', '/app/settings', '/privacy', '/terms']

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const route of routes) {
      await page.goto(route)
      await expect(page.locator('main')).toBeVisible()
      const contained = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      expect(contained.scrollWidth, `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
        contained.clientWidth,
      )
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const marketingCta = page.getByRole('link', { name: 'Try tonight’s question' }).first()
  await expect(marketingCta).toBeInViewport()

  const publicTargets = [
    page.getByRole('link', { name: 'Before They Grow home' }),
    page.getByRole('link', { name: 'Terms' }),
  ]
  for (const target of publicTargets) {
    const box = await target.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  await page.goto('/privacy')
  for (const target of await page.locator('.contents-list a').all()) {
    const box = await target.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Tonight’s question' })).toBeVisible()
  const appHomeBox = await page.getByRole('link', { name: 'Before They Grow home' }).boundingBox()
  expect(appHomeBox?.width).toBeGreaterThanOrEqual(44)
  expect(appHomeBox?.height).toBeGreaterThanOrEqual(44)
  const mobileNavigationFontSize = await page.locator('.app-nav-label').first().evaluate(
    (label) => Number.parseFloat(getComputedStyle(label).fontSize),
  )
  expect(mobileNavigationFontSize).toBeGreaterThanOrEqual(15)
  await page.getByText('How voice and transcripts work').click()
  const mobilePrivacyDetailsBox = await page.getByRole('link', { name: 'Privacy details' }).boundingBox()
  expect(mobilePrivacyDetailsBox?.width).toBeGreaterThanOrEqual(44)
  expect(mobilePrivacyDetailsBox?.height).toBeGreaterThanOrEqual(44)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Tonight’s question' })).toBeVisible()
  const desktopNavigationFontSize = await page.locator('.app-nav-label').first().evaluate(
    (label) => Number.parseFloat(getComputedStyle(label).fontSize),
  )
  expect(desktopNavigationFontSize).toBeGreaterThanOrEqual(15)
  await page.getByText('How voice and transcripts work').click()
  const desktopPrivacyDetailsBox = await page.getByRole('link', { name: 'Privacy details' }).boundingBox()
  expect(desktopPrivacyDetailsBox?.width).toBeGreaterThanOrEqual(44)
  expect(desktopPrivacyDetailsBox?.height).toBeGreaterThanOrEqual(44)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app')
  const record = page.getByRole('button', { name: 'Record an answer' })
  await expect(record).toBeInViewport()
  const navigationTargets = page.getByRole('navigation', { name: 'App navigation' }).getByRole('link')
  await expect(navigationTargets).toHaveCount(3)
  for (const target of await navigationTargets.all()) {
    const box = await target.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(56)
    await expect(target.locator('svg')).toBeVisible()
  }
})
