import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const sourceRoots = ['apps/mobile', 'packages']
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
// Native source is scanned for the transcription policy too, so an authored
// network speech call cannot hide outside the JS boundary.
const nativeSourceExtensions = new Set(['.swift', '.kt'])
const allSourceExtensions = new Set([...sourceExtensions, ...nativeSourceExtensions])
const forbiddenSource = [
  ['React DOM', /(?:from\s+['"]react-dom(?:\/[^'"]*)?['"]|require\(['"]react-dom)/],
  ['browser globals', /\b(?:window|document|indexedDB|MediaRecorder)\b/],
  ['browser Blob', /\bBlob\b/],
  ['CSS imports', /(?:import|require\()\s*['"][^'"]+\.css['"]/],
  ['IndexedDB adapter', /(?:from\s+['"]idb['"]|require\(['"]idb['"]\))/],
  ['WebView', /\bWebView\b|react-native-webview/],
  ['Web application import', /apps\/web|@before-they-grow\/web/],
]
const forbiddenNeutralSource = [
  [
    'native or Expo import in a neutral package',
    /(?:from\s+|import\s*\()\s*['"](?:react-native(?:\/[^'"]*)?|expo(?:\/[^'"]*|-[^'"]*)?)['"]/,
  ],
]

// Criterion for the native transcription slice: no cloud/network/third-party
// speech recognizer may be introduced. Recognizers that can fall back to a
// network service are forbidden outright.
const forbiddenTranscription = [
  ['cloud/network speech SDK', /@google-cloud\/speech|azure-cognitiveservices-speech|@azure\/ai-speech|react-native-voice|@react-native-voice|network speeCH/i],
  ['explicit network speech call', /speeCH\.(?:recognize|transcribe)|recognizer\.start\(.*network|networkSpeech/i],
]

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const candidate = path.join(directory, entry.name)
    if (entry.isDirectory() && ['node_modules', '.expo'].includes(entry.name)) return []
    if (entry.isDirectory()) return sourceFiles(candidate)
    return allSourceExtensions.has(path.extname(entry.name)) ? [candidate] : []
  }))
  return files.flat()
}

const violations = []
for (const root of sourceRoots) {
  for (const file of await sourceFiles(root)) {
    const contents = await readFile(file, 'utf8')
    if (sourceExtensions.has(path.extname(file))) {
      const patterns = root === 'packages'
        ? [...forbiddenSource, ...forbiddenNeutralSource]
        : forbiddenSource
      for (const [label, pattern] of patterns) {
        if (pattern.test(contents)) violations.push(`${file}: ${label}`)
      }
    }
    // The no-network-speech policy applies to JS and native source alike.
    for (const [label, pattern] of forbiddenTranscription) {
      if (pattern.test(contents)) violations.push(`${file}: forbidden ${label}`)
    }
  }
}

const manifests = {
  'packages/domain/package.json': [],
  'packages/contracts/package.json': ['@before-they-grow/domain'],
  'packages/application/package.json': [
    '@before-they-grow/contracts',
    '@before-they-grow/domain',
  ],
}

for (const [manifestPath, allowedDependencies] of Object.entries(manifests)) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const dependencies = Object.keys(manifest.dependencies ?? {})
  for (const dependency of dependencies) {
    if (!allowedDependencies.includes(dependency)) {
      violations.push(`${manifestPath}: disallowed runtime dependency ${dependency}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Native boundary violations:\n' + violations.map((item) => `- ${item}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Native and shared packages are free of browser and Web UI dependencies.')
}
