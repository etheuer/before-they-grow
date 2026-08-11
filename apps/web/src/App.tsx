import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarBlank,
  Check,
  CheckCircle,
  Desktop,
  DownloadSimple,
  Gear,
  Heart,
  House,
  Microphone,
  Moon,
  Pause,
  Play,
  ShieldCheck,
  Sparkle,
  Sun,
  Trash,
} from '@phosphor-icons/react'
import { Link, NavLink, useLocation, useRoutes } from 'react-router-dom'
import { getPromptForDate, type AgeBand } from '@before-they-grow/domain'
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

type AppearancePreference = 'system' | 'light' | 'dark'

const appearanceStorageKey = 'before-they-grow-appearance'

function readAppearancePreference(): AppearancePreference {
  try {
    const saved = localStorage.getItem(appearanceStorageKey)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyAppearance(preference: AppearancePreference) {
  const resolved = preference === 'system'
    ? systemPrefersDark() ? 'dark' : 'light'
    : preference
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
}

export function AppRoutes({ repository, now = () => new Date() }: AppRoutesProps) {
  const [appearance, setAppearance] = useState<AppearancePreference>(readAppearancePreference)

  useEffect(() => {
    try {
      localStorage.setItem(appearanceStorageKey, appearance)
    } catch {
      // Keep the selected appearance for this session when Web Storage is unavailable.
    }
    applyAppearance(appearance)
    if (appearance !== 'system' || typeof window.matchMedia !== 'function') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => applyAppearance('system')
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [appearance])

  return useRoutes([
    { path: '/', element: <MarketingPage /> },
    { path: '/privacy', element: <LegalPage type="privacy" /> },
    { path: '/terms', element: <LegalPage type="terms" /> },
    {
      path: '/app/*',
      element: (
        <ProductApp
          appearance={appearance}
          onAppearanceChange={setAppearance}
          repository={repository}
          now={now}
        />
      ),
    },
  ])
}

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Heart weight="fill" />
      </span>
      <span>Before They Grow</span>
    </span>
  )
}

function SiteHeader() {
  return (
    <header className="site-nav">
      <Link className="brand-link" to="/" aria-label="Before They Grow home"><Brand /></Link>
      <Link className="nav-cta" to="/app">
        Open app <ArrowRight aria-hidden="true" />
      </Link>
    </header>
  )
}

function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const isPrivacy = type === 'privacy'
  const privacyContents = [
    ['stored-data', 'What the app stores'],
    ['microphone', 'Microphone and transcription'],
    ['export-deletion', 'Export and deletion'],
    ['children', 'Children'],
  ]
  const termsContents = [
    ['your-content', 'Your content'],
    ['limitations', 'Prototype limitations'],
    ['appropriate-use', 'Appropriate use'],
    ['no-guarantee', 'No guarantee'],
  ]
  const contents = isPrivacy ? privacyContents : termsContents

  return (
    <main className="legal-page">
      <SiteHeader />
      <article className="legal-content">
        <Link className="back-link" to="/app"><ArrowLeft aria-hidden="true" /> Back to app</Link>
        <p className="eyebrow">Last updated August 10, 2026</p>
        <h1>{isPrivacy ? 'Privacy, in plain language' : 'Terms of use'}</h1>
        <nav className="contents-list" aria-label="On this page">
          <strong>On this page</strong>
          {contents.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
        </nav>
        {isPrivacy ? (
          <>
            <p className="legal-lead">
              Before They Grow is a local-first prototype. Your family profile, edited transcripts,
              and saved voice recordings are stored only in this browser on this device. Automatic
              transcription may use a speech service provided by your browser.
            </p>
            <h2 id="stored-data">What the app stores</h2>
            <p>
              The app stores the nickname, selected age range, question, parent-reviewed transcript,
              voice recording, and recording date needed to create your memories. This version has no
              account, server database, advertising SDK, or analytics service.
            </p>
            <h2 id="microphone">Microphone and transcription</h2>
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
            <h2 id="export-deletion">Export and deletion</h2>
            <p>
              You can download a portable JSON copy from Settings. You can also permanently delete
              the profile, answers, and recordings from this browser. Clearing browser storage can
              remove the same data, so exports are your responsibility.
            </p>
            <h2 id="children">Children</h2>
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
            <h2 id="your-content">Your content</h2>
            <p>
              You keep ownership of the answers and recordings you create. You are responsible for
              having permission to record anyone whose voice you save.
            </p>
            <h2 id="limitations">Prototype limitations</h2>
            <p>
              This version stores data in one browser and is not a backup service. Device loss,
              browser resets, or cleared site data may erase memories. Export important content
              regularly.
            </p>
            <h2 id="appropriate-use">Appropriate use</h2>
            <p>
              Do not use the app to record people without permission, violate privacy rights, or
              store unlawful content. The prompts are conversation aids, not medical, therapeutic,
              legal, or parenting advice.
            </p>
            <h2 id="no-guarantee">No guarantee</h2>
            <p>
              The prototype is provided as-is for evaluation. Availability, prompts, and features
              may change. A legally reviewed agreement and published support contact remain required
              before a commercial App Store release.
            </p>
          </>
        )}
        <div className="legal-links">
          <Link to="/app"><ArrowLeft aria-hidden="true" /> Back to app</Link>
          <Link to={isPrivacy ? '/terms' : '/privacy'}>
            {isPrivacy ? 'Read the terms' : 'Read the privacy notice'}
          </Link>
        </div>
      </article>
    </main>
  )
}

function MarketingPage() {
  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="hero">
        <Sparkle className="hero-spark hero-spark-one" weight="fill" aria-hidden="true" />
        <Sparkle className="hero-spark hero-spark-two" weight="fill" aria-hidden="true" />

        <div className="hero-copy">
          <p className="eyebrow">A private two-minute family ritual</p>
          <h1>One question tonight. <em>Their voice tomorrow.</em></h1>
          <p className="hero-subtitle">
            The funny, thoughtful, half-remembered answers — kept in their real
            voice. No account, no journal, no pressure to be profound.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/app">
              Try tonight’s question <ArrowRight aria-hidden="true" />
            </Link>
            <a className="text-link" href="#how-it-works">See the three steps</a>
          </div>
          <p className="hero-trust">
            <ShieldCheck aria-hidden="true" />
            No account. Saved in this browser. Export anytime.
          </p>
        </div>

        <div className="product-proof" aria-label="A preview of recording, review, and save states">
          <span className="proof-seal" aria-hidden="true"><Heart weight="fill" /></span>
          <div className="proof-meta">
            <span className="proof-tag"><Sparkle weight="fill" aria-hidden="true" />Tonight’s question</span>
            <time dateTime="2026-08-10">August 10, 2026</time>
          </div>
          <div className="proof-question">
            <strong>What made you laugh today?</strong>
            <div className="proof-record"><Microphone weight="fill" aria-hidden="true" /> Record an answer</div>
          </div>
          <div className="proof-review">
            <span>Review the transcript</span>
            <p>“The dog sneezed during breakfast.”</p>
          </div>
          <div className="proof-saved">
            <CheckCircle weight="fill" aria-hidden="true" />
            <span>Saved to Milo’s memories</span>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="how-it-works">
        <div className="section-heading">
          <h2>Ask. Record. Keep.</h2>
          <p>Three small steps. One quiet habit you’ll keep.</p>
        </div>
        <ol className="process-list">
          <li>
            <span className="process-icon" aria-hidden="true"><Sparkle weight="fill" /></span>
            <strong>Ask</strong>
            <span className="process-copy">One age-aware question, chosen for tonight — never an empty page.</span>
          </li>
          <li>
            <span className="process-icon" aria-hidden="true"><Microphone weight="fill" /></span>
            <strong>Record</strong>
            <span className="process-copy">The answer, in their own voice. You review before anything is saved.</span>
          </li>
          <li>
            <span className="process-icon" aria-hidden="true"><Heart weight="fill" /></span>
            <strong>Keep</strong>
            <span className="process-copy">Kept in this browser, ready to revisit — and exportable any time.</span>
          </li>
        </ol>
      </section>

      <section className="memory-showcase">
        <div>
          <h2>What you’ll want to hear again</h2>
          <p>
            Ordinary answers become the moments you can’t quite remember hearing.
            Their voice keeps them close.
          </p>
        </div>
        <article className="sample-memory">
          <span className="sample-kept" aria-hidden="true"><Heart weight="fill" />Kept</span>
          <time dateTime="2026-08-10">August 10, 2026</time>
          <h3>What made you laugh today?</h3>
          <blockquote>“The dog sneezed during breakfast and scared himself.”</blockquote>
          <div className="sample-play"><Play weight="fill" aria-hidden="true" /> Play answer <span>0:18</span></div>
        </article>
      </section>

      <section className="privacy-section">
        <div className="privacy-heading">
          <ShieldCheck aria-hidden="true" />
          <h2>Kept close, by design</h2>
        </div>
        <div className="privacy-points">
          <p><strong>Kept in this browser.</strong> Memories stay right where you saved them — no Before They Grow account, no cloud.</p>
          <p><strong>The listening is your browser’s.</strong> Automatic transcription may use your browser provider’s speech service.</p>
          <p><strong>You keep control.</strong> Export a JSON backup, or permanently delete local data, any time.</p>
        </div>
      </section>

      <section className="final-cta">
        <div className="final-cta-copy">
          <h2>Two minutes is enough to keep one ordinary answer.</h2>
          <p className="final-cta-sub">One question. One answer. That’s the whole ritual.</p>
        </div>
        <Link className="button button-primary" to="/app">
          Try tonight’s question <ArrowRight aria-hidden="true" />
        </Link>
      </section>

      <footer>
        <Brand />
        <div className="footer-meta">
          <p>For the answers you’ll want to hear again.</p>
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
  appearance: AppearancePreference
  onAppearanceChange: (preference: AppearancePreference) => void
}

function ProductApp({
  repository,
  now,
  appearance,
  onAppearanceChange,
}: ProductAppProps) {
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
    return <div className="app-loading" role="status">Preparing tonight’s question…</div>
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
        appearance={appearance}
        now={now}
        profile={profile}
        repository={repository}
        onAppearanceChange={onAppearanceChange}
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
  const [ageBand, setAgeBand] = useState<AgeBand | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const valid = childName.trim().length > 0 && ageBand !== ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedName = childName.trim()
    if (!normalizedName || !ageBand) return
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
      <Link className="app-brand" to="/"><Brand /></Link>
      <div className="onboarding-layout">
        <form className="onboarding-card" onSubmit={submit}>
          <h1>Who are we listening to?</h1>
          <p>A nickname and age range help us choose better questions.</p>

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
                  <span>{label}<Check weight="bold" aria-hidden="true" /></span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="privacy-note">
            <ShieldCheck aria-hidden="true" />
            <p>
              Saved memories stay in this browser. Automatic transcripts may use your browser’s speech
              service. <Link to="/privacy">Learn more</Link>.
            </p>
          </div>

          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          <button className="button button-primary button-full" disabled={saving || !valid} type="submit">
            {saving ? 'Saving…' : 'Start our ritual'}
          </button>
        </form>
        <aside className="onboarding-outcome" aria-hidden="true">
          <p>Tonight’s outcome</p>
          <blockquote>“I was proud when I read the whole page by myself.”</blockquote>
          <span><Play weight="fill" /> Voice and reviewed words, saved together.</span>
        </aside>
      </div>
    </main>
  )
}

function AppNavigation() {
  return (
    <nav aria-label="App navigation">
      <NavLink end to="/app">
        {({ isActive }) => (
          <><House weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /><span className="app-nav-label">Tonight</span></>
        )}
      </NavLink>
      <NavLink to="/app/memories">
        {({ isActive }) => (
          <><BookOpen weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /><span className="app-nav-label">Memories</span></>
        )}
      </NavLink>
      <NavLink to="/app/settings">
        {({ isActive }) => (
          <><Gear weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /><span className="app-nav-label">Settings</span></>
        )}
      </NavLink>
    </nav>
  )
}

function AppHeader() {
  return (
    <header className="app-header">
      <Link className="brand-link" to="/" aria-label="Before They Grow home"><Brand /></Link>
      <AppNavigation />
    </header>
  )
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

type AudioPlayerProps = {
  audio: Blob
  label: string
  primaryLabel?: string
  showActionLabel?: boolean
}

function AudioPlayer({ audio, label, primaryLabel, showActionLabel = false }: AudioPlayerProps) {
  const [source, setSource] = useState('')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(audio)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [audio])

  async function togglePlayback() {
    const player = audioRef.current
    if (!player) return
    if (player.paused) {
      try {
        await player.play()
        setPlaying(true)
      } catch {
        setPlaying(false)
      }
    } else {
      player.pause()
      setPlaying(false)
    }
  }

  const actionLabel = primaryLabel
    ? playing
      ? primaryLabel.startsWith('Play ')
        ? `Pause ${primaryLabel.slice(5)}`
        : `Pause ${primaryLabel.toLowerCase()}`
      : primaryLabel
    : playing ? `Pause ${label.toLowerCase()}` : `Play ${label.toLowerCase()}`

  return (
    <div className={`audio-player${primaryLabel ? ' audio-player-primary' : ''}`}>
      <button onClick={togglePlayback} type="button" aria-label={actionLabel}>
        {playing ? <Pause weight="fill" aria-hidden="true" /> : <Play weight="fill" aria-hidden="true" />}
        <span>{primaryLabel ? actionLabel : showActionLabel ? actionLabel : label}</span>
      </button>
      <span className="audio-time" role="status">
        {formatTime(currentTime)} / {duration ? formatTime(duration) : '--:--'}
      </span>
      <audio
        ref={audioRef}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false)
          setCurrentTime(0)
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        preload="metadata"
        src={source || undefined}
      />
    </div>
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
        if (active) setError('We could not open your memories. Your local data was not changed.')
      })
    return () => {
      active = false
    }
  }, [repository, loadAttempt])

  const groupedMemories = memories?.reduce<Array<{ label: string; entries: MemoryEntry[] }>>((groups, memory) => {
    const label = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(memory.recordedAt))
    const last = groups.at(-1)
    if (last?.label === label) last.entries.push(memory)
    else groups.push({ label, entries: [memory] })
    return groups
  }, [])

  return (
    <main className="product-shell app-screen">
      <AppHeader />
      <section className="timeline-panel">
        <h1>{profile.childName}’s memories</h1>
        <p className="screen-intro">
          {error
            ? 'Saved answers unavailable.'
            : memories === null
              ? 'Opening saved answers…'
              : `${memories.length} saved ${memories.length === 1 ? 'answer' : 'answers'}`}
        </p>

        {error ? (
          <div className="empty-state" role="alert">
            <strong>{error}</strong>
            <button className="button button-secondary" onClick={() => setLoadAttempt((value) => value + 1)} type="button">
              Try again
            </button>
          </div>
        ) : memories === null ? (
          <div className="timeline-loading" role="status" aria-label="Opening memories">
            <span /><span /><span />
          </div>
        ) : memories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-memory-mark" aria-hidden="true">
              <CalendarBlank /><Heart weight="fill" />
            </div>
            <h2>The first answer starts with tonight’s question.</h2>
            <Link className="button button-primary" to="/app">See tonight’s question</Link>
          </div>
        ) : (
          <div className="timeline-groups">
            {groupedMemories?.map((group) => (
              <section className="memory-month" key={group.label}>
                <h2>{group.label}</h2>
                <div className="timeline-list">
                  {group.entries.map((memory) => (
                    <article className="memory-card" key={memory.id}>
                      <time dateTime={memory.recordedAt}>
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        }).format(new Date(memory.recordedAt))}
                      </time>
                      <h3>{memory.question}</h3>
                      {memory.answerText ? <blockquote>“{memory.answerText}”</blockquote> : null}
                      {memory.audio ? <AudioPlayer audio={memory.audio} label="Answer" showActionLabel /> : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

type SettingsScreenProps = {
  profile: FamilyProfile
  repository: MemoryRepository
  now: () => Date
  onDeleted: () => void
  appearance: AppearancePreference
  onAppearanceChange: (preference: AppearancePreference) => void
}

function SettingsScreen({
  profile,
  repository,
  now,
  onDeleted,
  appearance,
  onAppearanceChange,
}: SettingsScreenProps) {
  const [status, setStatus] = useState('')
  const [exportError, setExportError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function exportMemories() {
    setExporting(true)
    setExportError('')
    setStatus('Preparing your backup…')
    try {
      const memories = await repository.listMemories()
      const portableExport = await buildPortableExport(profile, memories, now())
      downloadPortableExport(portableExport)
      setStatus('Your export was downloaded.')
    } catch {
      setStatus('')
      setExportError('We could not prepare your export. Your local data was not changed.')
    } finally {
      setExporting(false)
    }
  }

  async function deleteEverything() {
    setDeleting(true)
    setDeleteError('')
    try {
      await repository.deleteAll()
      onDeleted()
    } catch {
      setDeleteError('We could not delete your local data. Nothing was removed.')
    } finally {
      setDeleting(false)
    }
  }

  const appearanceOptions: Array<{
    value: AppearancePreference
    label: string
    icon: typeof Desktop
  }> = [
    { value: 'system', label: 'System', icon: Desktop },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ]

  return (
    <main className="product-shell app-screen">
      <AppHeader />
      <section className="settings-panel">
        <h1>Settings</h1>
        <p className="screen-intro">Control appearance and the family data stored in this browser.</p>

        <section className="settings-section">
          <div className="settings-section-heading">
            <h2>Appearance</h2>
            <p>Choose a calm theme for daytime or night use.</p>
          </div>
          <fieldset className="appearance-options">
            <legend className="visually-hidden">Appearance</legend>
            {appearanceOptions.map(({ value, label, icon: Icon }) => (
              <label key={value}>
                <input
                  checked={appearance === value}
                  name="appearance"
                  onChange={() => onAppearanceChange(value)}
                  type="radio"
                  value={value}
                />
                <span><Icon aria-hidden="true" />{label}<Check weight="bold" aria-hidden="true" /></span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="settings-section storage-section">
          <div className="settings-section-heading">
            <h2>Where memories live</h2>
            <p>
              Your profile, transcripts, and recordings stay in this browser. Browser speech
              processing may depend on your device and browser. Clearing site data can remove memories.
            </p>
            <div className="inline-links">
              <Link to="/privacy">Read privacy details</Link>
              <Link to="/terms">Read terms</Link>
            </div>
          </div>
          <ShieldCheck aria-hidden="true" />
        </section>

        <section className="settings-section export-section">
          <div className="settings-section-heading">
            <h2>Export</h2>
            <p>Download a portable JSON backup with reviewed transcripts and embedded audio.</p>
          </div>
          <button className="button button-secondary" disabled={exporting} onClick={exportMemories} type="button">
            <DownloadSimple aria-hidden="true" />
            {exporting ? 'Preparing…' : 'Download a backup'}
          </button>
          {status ? <p className="settings-status" role="status">{status}</p> : null}
          {exportError ? <p className="inline-error" role="alert">{exportError}</p> : null}
        </section>

        <section className="settings-section danger-section">
          <div className="settings-section-heading">
            <h2>Danger zone</h2>
            <p>Delete the profile, transcripts, and voice recordings stored locally in this browser.</p>
          </div>
          {confirmingDelete ? (
            <div className="delete-confirmation" role="alertdialog" aria-label="Confirm deletion">
              <Trash aria-hidden="true" />
              <p>
                This permanently removes {profile.childName}’s profile, every transcript, and every
                recording from this browser. Export a backup first if you want to keep a copy.
              </p>
              <div className="delete-actions">
                <button className="button button-safe" onClick={() => setConfirmingDelete(false)} type="button">
                  Cancel
                </button>
                <button className="button button-danger-outline" disabled={deleting} onClick={deleteEverything} type="button">
                  {deleting ? 'Deleting…' : 'Yes, delete everything'}
                </button>
              </div>
            </div>
          ) : (
            <button className="button button-danger-outline" onClick={() => setConfirmingDelete(true)} type="button">
              <Trash aria-hidden="true" /> Delete everything
            </button>
          )}
          {deleteError ? <p className="inline-error" role="alert">{deleteError}</p> : null}
        </section>
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
        setError('We could not save this answer. Your recording is still here, along with your text. Try saving again.')
      }
    } finally {
      if (dailyMountedRef.current) setSaving(false)
    }
  }

  return (
    <main className="product-shell app-screen">
      <AppHeader />
      <section className="question-panel">
        <div className="question-meta">
          <span>For {profile.childName}</span>
          <span>{prompt.category}</span>
        </div>
        <h1>Tonight’s question</h1>
        <p className="daily-question">{prompt.question}</p>
        <details className="follow-up">
          <summary>Need a nudge?</summary>
          <p>{prompt.followUp}</p>
        </details>

        {saved ? (
          <div className="saved-message" role="status">
            <CheckCircle weight="fill" aria-hidden="true" />
            <h2>Saved to {profile.childName}’s memories.</h2>
            <p>This answer is stored in this browser.</p>
            {audio ? <AudioPlayer audio={audio} label="Saved answer" primaryLabel="Play this memory" /> : null}
            <Link className="button button-secondary button-full" to="/app/memories">View memories</Link>
            <small>A new question will be ready tomorrow.</small>
          </div>
        ) : (
          <form className="answer-form" onSubmit={saveAnswer}>
            <AudioRecorder
              onRecorded={receiveRecording}
              onRecordingStarted={beginRecording}
              onUnavailable={recoverWithoutRecording}
              preservesPreviousAnswer={Boolean(audio || answerText.trim())}
            />
            {captureInProgress ? (
              <p className="capture-helper">
                {replacingAnswer
                  ? 'Recording a replacement. Your previous voice and transcript remain safe until the new recording finishes.'
                  : 'Recording now. Finish when they are done, then review the transcript.'}
              </p>
            ) : transcriptStatus === null ? (
              <>
                <p className="capture-helper">Tap once to start. You’ll review before anything is saved.</p>
                <details className="voice-disclosure">
                  <summary>How voice and transcripts work</summary>
                  <p>
                    Saved memories stay in this browser. When supported, your browser may process
                    speech on your device or through its provider. <Link to="/privacy">Privacy details</Link>.
                  </p>
                </details>
              </>
            ) : (
              <div className="transcript-review">
                {audio ? <AudioPlayer audio={audio} label="Recorded answer" /> : null}
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
                className="button button-primary button-full save-answer"
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
