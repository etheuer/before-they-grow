import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('the production document exposes the installable manifest', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  )
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
        this.ondataavailable?.({
          data: new Blob(['family-voice'], { type: 'audio/webm' }),
        } as BlobEvent)
        this.onstop?.()
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
  })

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
  await expect(page.getByLabel('Review the transcript')).toHaveCount(0)
  await page.getByRole('button', { name: 'Record their voice' }).click()
  await page.getByRole('button', { name: 'Finish recording' }).click()

  const transcript = page.getByLabel('Review the transcript')
  await expect(transcript).toHaveValue('I learned how to wistle.')
  await transcript.fill('I learned how to whistle.')
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
  await expect(page.getByText('Saved to Milo’s timeline.')).toBeVisible()

  await page.getByRole('link', { name: 'Memories' }).click()
  await expect(page.getByRole('heading', { name: 'Milo’s growing timeline' })).toBeVisible()
  await expect(page.getByText('“I learned how to whistle.”')).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export my memories' }).click()
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
