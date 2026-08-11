import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const sourceRoots = ['apps/mobile', 'packages']
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
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

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const candidate = path.join(directory, entry.name)
    if (entry.isDirectory() && ['node_modules', '.expo'].includes(entry.name)) return []
    if (entry.isDirectory()) return sourceFiles(candidate)
    return sourceExtensions.has(path.extname(entry.name)) ? [candidate] : []
  }))
  return files.flat()
}

const violations = []
for (const root of sourceRoots) {
  for (const file of await sourceFiles(root)) {
    const contents = await readFile(file, 'utf8')
    const patterns = root === 'packages'
      ? [...forbiddenSource, ...forbiddenNeutralSource]
      : forbiddenSource
    for (const [label, pattern] of patterns) {
      if (pattern.test(contents)) violations.push(`${file}: ${label}`)
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
