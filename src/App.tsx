import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CalendarBlank,
  DownloadSimple,
  Heart,
  Microphone,
  ShieldCheck,
  Sparkle,
  Trash,
} from '@phosphor-icons/react'
import { Link, NavLink, useLocation, useRoutes } from 'react-router-dom'
import type { AgeBand } from './domain/prompts'
import { getPromptForDate } from './domain/prompts'
import type {
  FamilyProfile,
  MemoryEntry,
  MemoryRepository,
} from './data/memoryRepository'
import {
  buildPortableExport,
  downloadPortableExport,
} from './data/portableExport'
import { AudioRecorder } from './components/AudioRecorder'
import type {
  RecordedAnswer,
  TranscriptStatus,
} from './components/AudioRecorder'

export type AppRoutesProps = {
  repository: MemoryRepository
  now?: () => Date
}

export function AppRoutes({ repository, now = () => new Date() }: AppRoutesProps) {
  return useRoutes([
    { path: '/', element: <MarketingPage /> },
    { path: '/privacy', element: <LegalPage type="privacy" /> },
    { path: '/terms', element: <LegalPage type="terms" /> },
    { path: '/app/*', element: <ProductApp repository={repository} now={now} /> },
  ])
}

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Heart weight="fill" />
      </span>
      Before They Grow
    </span>
  )
}

function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const isPrivacy = type === 'privacy'

  return (
    <main className="legal-page">
      <header className="site-nav">
        <Link to="/" aria-label="Before They Grow home"><Brand /></Link>
        <Link className="nav-cta" to="/app">Open app <ArrowRight aria-hidden="true" /></Link>
      </header>
      <article className="legal-content">
        <p className="eyebrow">Last updated August 10, 2026</p>
        <h1>{isPrivacy ? 'Privacy, in plain language' : 'Terms of use'}</h1>
        {isPrivacy ? (
          <>
            <p className="legal-lead">
              Before They Grow is a local-first prototype. Your family profile, edited transcripts,
              and saved voice recordings are stored only in this browser on this device. Automatic
              transcription may use a speech service provided by your browser.
            </p>
            <h2>What the app stores</h2>
            <p>
              The app stores the nickname, selected age range, question, parent-reviewed transcript,
              voice recording, and recording date needed to create your timeline. This version has no
              account, server database, advertising SDK, or analytics service.
            </p>
            <h2>Microphone and transcription</h2>
            <p>
              Microphone permission is requested only after you choose to record. When automatic
              transcription is available, your browser’s speech recognition service may process the
              voice while you record. Depending on the browser and device, processing may happen on
              the device or through the browser provider’s servers. Before They Grow does not select,
              receive, or control that provider’s processing. Review your browser’s privacy terms if
              this matters to you.
            </p>
            <p>
              The app releases the microphone when recording ends. The resulting recording and the
              transcript you review are stored in this browser unless you export them. If automatic
              transcription is unavailable, you can enter or correct the transcript manually.
            </p>
            <h2>Export and deletion</h2>
            <p>
              You can download a portable JSON copy from Settings. You can also permanently delete
              the profile, answers, and recordings from this browser. Clearing browser storage can
              remove the same data, so exports are your responsibility.
            </p>
            <h2>Children</h2>
            <p>
              This product is designed for a parent or guardian to operate. Children should not
              enter personal contact information. This prototype does not send saved memories to a
              Before They Grow server because no such server exists. Your browser’s speech service
              may process voice to create a transcript as described above.
            </p>
          </>
        ) : (
          <>
            <p className="legal-lead">
              These terms cover use of the Before They Grow prototype. By using it, you agree to
              operate it responsibly as a parent, guardian, or authorized adult.
            </p>
            <h2>Your content</h2>
            <p>
              You keep ownership of the answers and recordings you create. You are responsible for
              having permission to record anyone whose voice you save.
            </p>
            <h2>Prototype limitations</h2>
            <p>
              This version stores data in one browser and is not a backup service. Device loss,
              browser resets, or cleared site data may erase memories. Export important content
              regularly.
            </p>
            <h2>Appropriate use</h2>
            <p>
              Do not use the app to record people without permission, violate privacy rights, or
              store unlawful content. The prompts are conversation aids, not medical, therapeutic,
              legal, or parenting advice.
            </p>
            <h2>No guarantee</h2>
            <p>
              The prototype is provided as-is for evaluation. Availability, prompts, and features
              may change. A legally reviewed agreement and published support contact remain required
              before a commercial App Store release.
            </p>
          </>
        )}
        <div className="legal-links">
          <Link to={isPrivacy ? '/terms' : '/privacy'}>{isPrivacy ? 'Read the terms' : 'Read the privacy notice'}</Link>
          <Link to="/">Back home</Link>
        </div>
      </article>
    </main>
  )
}

function MarketingPage() {
  return (
    <main className="marketing-page">
      <header className="site-nav">
        <Link to="/" aria-label="Before They Grow home">
          <Brand />
        </Link>
        <Link className="nav-cta" to="/app">
          Open app <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A two-minute family ritual</p>
          <h1>One question tonight. Their voice tomorrow.</h1>
          <p className="hero-subtitle">
            Capture the funny, thoughtful answers you will wish you could hear again.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/app">
              Try tonight’s question <ArrowRight aria-hidden="true" />
            </Link>
            <a className="text-link" href="#how-it-works">
              See how it works
            </a>
          </div>
        </div>

        <div className="hero-product" aria-hidden="true">
          <div className="phone-preview">
            <div className="phone-status">
              <span>Tonight</span>
              <span>2 min</span>
            </div>
            <p className="preview-label">For Milo, age 7</p>
            <p className="preview-question">
              What happened today that made you feel proud?
            </p>
            <div className="record-preview">
              <Microphone weight="fill" aria-hidden="true" />
              Hold to answer
            </div>
            <p className="preview-promise">Saved on this device</p>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Product commitments">
        <div>
          <ShieldCheck aria-hidden="true" />
          <span>Saved memories stay local</span>
        </div>
        <div>
          <Sparkle aria-hidden="true" />
          <span>Age-aware prompts</span>
        </div>
        <div>
          <ArrowRight aria-hidden="true" />
          <span>Export anytime</span>
        </div>
      </section>

      <section id="how-it-works" className="how-it-works">
        <div className="section-heading">
          <h2>Small enough to do. Meaningful enough to keep.</h2>
          <p>One prompt, one answer, one growing timeline of who they were.</p>
        </div>
        <div className="process-grid">
          <article className="process-lead">
            <span>01</span>
            <h3>Ask</h3>
            <p>Open one age-aware question at bedtime, dinner, or the drive home.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Listen</h3>
            <p>Record their real voice, review the automatic transcript, and correct any words.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Keep</h3>
            <p>Return to a private timeline that remains exportable without a subscription.</p>
          </article>
        </div>
      </section>

      <section className="final-cta">
        <p>Tonight’s question is ready.</p>
        <h2>Do not wait for a quieter season.</h2>
        <Link className="button button-light" to="/app">
          Start the ritual <ArrowRight aria-hidden="true" />
        </Link>
      </section>

      <footer>
        <Brand />
        <div className="footer-meta">
          <p>Built for parents who know ordinary nights become the memories.</p>
          <nav aria-label="Legal links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}

type ProductAppProps = {
  repository: MemoryRepository
  now: () => Date
}

function ProductApp({ repository, now }: ProductAppProps) {
  const location = useLocation()
  const [profile, setProfile] = useState<FamilyProfile | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setProfile(undefined)
    setLoadError('')
    void repository.getProfile()
      .then((savedProfile) => {
        if (active) setProfile(savedProfile)
      })
      .catch(() => {
        if (active) setLoadError('We could not open your local family data.')
      })
    return () => {
      active = false
    }
  }, [repository, loadAttempt])

  if (loadError) {
    return (
      <main className="app-loading">
        <div className="empty-state" role="alert">
          <strong>{loadError}</strong>
          <p>Your browser may be blocking storage. Nothing was changed.</p>
          <button className="button button-secondary" onClick={() => setLoadAttempt((value) => value + 1)} type="button">
            Try again
          </button>
        </div>
      </main>
    )
  }

  if (profile === undefined) {
    return <div className="app-loading">Preparing tonight’s question…</div>
  }

  if (profile === null) {
    return (
      <Onboarding
        now={now}
        onComplete={async (nextProfile) => {
          await repository.saveProfile(nextProfile)
          setProfile(nextProfile)
        }}
      />
    )
  }

  if (location.pathname === '/app/memories') {
    return <MemoriesScreen profile={profile} repository={repository} />
  }

  if (location.pathname === '/app/settings') {
    return (
      <SettingsScreen
        now={now}
        profile={profile}
        repository={repository}
        onDeleted={() => setProfile(null)}
      />
    )
  }

  return <DailyQuestion profile={profile} repository={repository} now={now} />
}

type OnboardingProps = {
  now: () => Date
  onComplete: (profile: FamilyProfile) => Promise<void>
}

function Onboarding({ now, onComplete }: OnboardingProps) {
  const [childName, setChildName] = useState('')
  const [ageBand, setAgeBand] = useState<AgeBand>('6-8')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedName = childName.trim()
    if (!normalizedName) return
    setSaving(true)
    setError('')
    try {
      await onComplete({
        childName: normalizedName,
        ageBand,
        consentedAt: now().toISOString(),
      })
    } catch {
      setError('We could not save this profile. Check browser storage and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="product-shell onboarding-shell">
      <Link className="app-brand" to="/">
        <Brand />
      </Link>
      <form className="onboarding-card" onSubmit={submit}>
        <p className="step-label">Set up in under a minute</p>
        <h1>Who are we listening to?</h1>
        <p>We use a nickname and age range only to choose better questions.</p>

        <label className="field">
          <span>Child’s first name or nickname</span>
          <input
            autoComplete="off"
            maxLength={40}
            required
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
          />
        </label>

        <fieldset>
          <legend>Age range</legend>
          <div className="age-options">
            {[
              ['3-5', '3 to 5'],
              ['6-8', '6 to 8'],
              ['9-12', '9 to 12'],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  checked={ageBand === value}
                  name="age-band"
                  onChange={() => setAgeBand(value as AgeBand)}
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="privacy-note">
          <ShieldCheck aria-hidden="true" />
          <p>
            Saved memories stay on this device. Automatic transcripts may use your browser’s speech
            service. <Link to="/privacy">Learn more</Link>.
          </p>
        </div>

        {error ? <p className="inline-error" role="alert">{error}</p> : null}
        <button className="button button-primary button-full" disabled={saving} type="submit">
          {saving ? 'Saving…' : 'Start our ritual'}
        </button>
      </form>
    </main>
  )
}

function AppHeader() {
  return (
    <header className="app-header">
      <Brand />
      <nav aria-label="App navigation">
        <NavLink end to="/app">Tonight</NavLink>
        <NavLink to="/app/memories">Memories</NavLink>
        <NavLink to="/app/settings">Settings</NavLink>
      </nav>
    </header>
  )
}

type MemoriesScreenProps = {
  profile: FamilyProfile
  repository: MemoryRepository
}

function MemoriesScreen({ profile, repository }: MemoriesScreenProps) {
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setMemories(null)
    setError('')
    void repository.listMemories()
      .then((savedMemories) => {
        if (active) setMemories(savedMemories)
      })
      .catch(() => {
        if (active) setError('We could not open this timeline. Your local data was not changed.')
      })
    return () => {
      active = false
    }
  }, [repository, loadAttempt])

  return (
    <main className="product-shell app-screen">
      <AppHeader />
      <section className="timeline-panel">
        <p className="step-label">Your private collection</p>
        <h1>{profile.childName}’s growing timeline</h1>
        <p className="screen-intro">The small answers, in the order they happened.</p>

        {error ? (
          <div className="empty-state" role="alert">
            <strong>{error}</strong>
            <button className="button button-secondary" onClick={() => setLoadAttempt((value) => value + 1)} type="button">
              Try again
            </button>
          </div>
        ) : memories === null ? (
          <p className="empty-state">Opening the timeline…</p>
        ) : memories.length === 0 ? (
          <div className="empty-state">
            <CalendarBlank aria-hidden="true" />
            <h2>The first answer starts tonight.</h2>
            <Link className="button button-primary" to="/app">See tonight’s question</Link>
          </div>
        ) : (
          <div className="timeline-list">
            {memories.map((memory) => (
              <article className="memory-card" key={memory.id}>
                <time dateTime={memory.recordedAt}>
                  {new Intl.DateTimeFormat('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }).format(new Date(memory.recordedAt))}
                </time>
                <h2>{memory.question}</h2>
                {memory.answerText ? <blockquote>“{memory.answerText}”</blockquote> : null}
                {memory.audio ? <MemoryAudio audio={memory.audio} /> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function MemoryAudio({ audio }: { audio: Blob }) {
  const [source, setSource] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(audio)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [audio])

  return source ? <audio className="memory-audio" controls src={source} /> : null
}

type SettingsScreenProps = {
  profile: FamilyProfile
  repository: MemoryRepository
  now: () => Date
  onDeleted: () => void
}

function SettingsScreen({
  profile,
  repository,
  now,
  onDeleted,
}: SettingsScreenProps) {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function exportMemories() {
    setExporting(true)
    setError('')
    setStatus('Preparing your export…')
    try {
      const memories = await repository.listMemories()
      const portableExport = await buildPortableExport(profile, memories, now())
      downloadPortableExport(portableExport)
      setStatus('Your export was downloaded.')
    } catch {
      setStatus('')
      setError('We could not prepare your export. Your local data was not changed.')
    } finally {
      setExporting(false)
    }
  }

  async function deleteEverything() {
    setDeleting(true)
    setError('')
    try {
      await repository.deleteAll()
      onDeleted()
    } catch {
      setError('We could not delete your local data. Nothing was removed.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="product-shell app-screen">
      <AppHeader />
      <section className="settings-panel">
        <p className="step-label">Your data, your decision</p>
        <h1>Privacy and settings</h1>
        <p className="screen-intro">
          Before They Grow stores this family timeline in this browser. No account is required.
        </p>

        <article className="settings-card">
          <div className="settings-icon"><DownloadSimple aria-hidden="true" /></div>
          <div>
            <h2>Take every memory with you</h2>
            <p>Download a readable JSON file with reviewed transcripts and voice recordings included.</p>
            <button className="button button-secondary" disabled={exporting} onClick={exportMemories} type="button">
              {exporting ? 'Preparing…' : 'Export my memories'}
            </button>
            {status ? <p className="settings-status" role="status">{status}</p> : null}
            {error ? <p className="inline-error" role="alert">{error}</p> : null}
          </div>
        </article>

        <article className="settings-card danger-card">
          <div className="settings-icon"><Trash aria-hidden="true" /></div>
          <div>
            <h2>Delete local family data</h2>
            <p>This permanently removes the profile, answers, and recordings from this browser.</p>
            {confirmingDelete ? (
              <div className="delete-confirmation" role="alertdialog" aria-label="Confirm deletion">
                <p>Export first if you want to keep a copy. This cannot be undone.</p>
                <button className="button button-danger" disabled={deleting} onClick={deleteEverything} type="button">
                  {deleting ? 'Deleting…' : 'Yes, delete everything'}
                </button>
                <button className="text-button" onClick={() => setConfirmingDelete(false)} type="button">
                  Cancel
                </button>
              </div>
            ) : (
              <button className="text-button danger-link" onClick={() => setConfirmingDelete(true)} type="button">
                Delete everything
              </button>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}

type DailyQuestionProps = {
  profile: FamilyProfile
  repository: MemoryRepository
  now: () => Date
}

function DailyQuestion({ profile, repository, now }: DailyQuestionProps) {
  const [answerText, setAnswerText] = useState('')
  const [audio, setAudio] = useState<Blob | null>(null)
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus | null>(null)
  const [captureInProgress, setCaptureInProgress] = useState(false)
  const [replacingAnswer, setReplacingAnswer] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const transcriptReviewRef = useRef<HTMLTextAreaElement>(null)
  const dailyMountedRef = useRef(true)
  const prompt = getPromptForDate(now(), profile.ageBand)

  useEffect(() => {
    dailyMountedRef.current = true
    return () => {
      dailyMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (captureInProgress || transcriptStatus === null || window.innerWidth > 620) return
    const frame = window.requestAnimationFrame(() => {
      transcriptReviewRef.current?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [captureInProgress, transcriptStatus])

  function beginRecording() {
    setReplacingAnswer(Boolean(audio || answerText.trim()))
    setCaptureInProgress(true)
    setError('')
  }

  function receiveRecording(answer: RecordedAnswer) {
    setCaptureInProgress(false)
    setReplacingAnswer(false)
    setAudio(answer.audio)
    setAnswerText(answer.transcript)
    setTranscriptStatus(answer.transcriptStatus)
  }

  function recoverWithoutRecording() {
    setCaptureInProgress(false)
    setReplacingAnswer(false)
    if (audio || answerText.trim()) return
    setAudio(null)
    setAnswerText('')
    setTranscriptStatus('unavailable')
  }

  async function saveAnswer(event: FormEvent) {
    event.preventDefault()
    const answer = answerText.trim()
    if (!answer && !audio) return
    setSaving(true)
    setError('')
    try {
      await repository.addMemory({
        id: crypto.randomUUID(),
        promptId: prompt.id,
        question: prompt.question,
        answerText: answer,
        audio,
        recordedAt: now().toISOString(),
      })
      if (dailyMountedRef.current) setSaved(true)
    } catch {
      if (dailyMountedRef.current) {
        setError('We could not save this answer. Your recording and text are still here so you can try again.')
      }
    } finally {
      if (dailyMountedRef.current) setSaving(false)
    }
  }

  return (
    <main className="product-shell app-screen">
      <header className="app-header">
        <Brand />
        <nav aria-label="App navigation">
          <NavLink end to="/app">Tonight</NavLink>
          <NavLink to="/app/memories">Memories</NavLink>
          <NavLink to="/app/settings">Settings</NavLink>
        </nav>
      </header>

      <section className="question-panel">
        <div className="question-meta">
          <span>For {profile.childName}</span>
          <span>{prompt.category}</span>
        </div>
        <h1>Tonight’s question</h1>
        <p className="daily-question">{prompt.question}</p>
        <p className="follow-up">If they need a nudge: {prompt.followUp}</p>

        {saved ? (
          <div className="saved-message" role="status">
            <Heart weight="fill" aria-hidden="true" />
            <div>
              <strong>Saved to {profile.childName}’s timeline.</strong>
              <p>The ordinary words are often the ones worth keeping.</p>
            </div>
          </div>
        ) : (
          <form className="answer-form" onSubmit={saveAnswer}>
            <AudioRecorder
              onRecorded={receiveRecording}
              onRecordingStarted={beginRecording}
              onUnavailable={recoverWithoutRecording}
            />
            {captureInProgress ? (
              <p className="capture-helper" role="status">
                {replacingAnswer
                  ? 'Recording a replacement. Your previous voice and transcript stay available unless the new recording finishes successfully.'
                  : 'Recording now. Finish when they are done, then review the transcript.'}
              </p>
            ) : transcriptStatus === null ? (
              <p className="capture-helper">
                Record their answer first. When supported, your browser will create an editable
                transcript. Speech processing depends on your browser and device.{' '}
                <Link to="/privacy">Learn about privacy</Link>.
              </p>
            ) : (
              <div className="transcript-review">
                <div className="field">
                  <label htmlFor="answer-transcript">Review the transcript</label>
                  <small className="field-help" id="transcript-help">
                    {transcriptStatus === 'complete'
                      ? 'Correct anything the transcript misheard. Your original voice recording stays unchanged.'
                      : audio
                        ? 'Automatic transcription was not available. Type what they said, or save the voice recording without text.'
                        : 'Voice recording was not available. You can type what they said as a recovery option.'}
                  </small>
                  <textarea
                    ref={transcriptReviewRef}
                    aria-describedby="transcript-help"
                    id="answer-transcript"
                    placeholder="Edit or type the transcript…"
                    rows={5}
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                  />
                </div>
              </div>
            )}
            {error ? <p className="inline-error" role="alert">{error}</p> : null}
            {!captureInProgress && transcriptStatus !== null ? (
              <button
                className="button button-primary button-full"
                disabled={saving || (!audio && answerText.trim().length === 0)}
                type="submit"
              >
                {saving
                  ? 'Saving…'
                  : audio
                    ? answerText.trim()
                      ? 'Save voice and transcript'
                      : 'Save voice answer'
                    : 'Save transcript'}
              </button>
            ) : null}
          </form>
        )}
      </section>
    </main>
  )
}
