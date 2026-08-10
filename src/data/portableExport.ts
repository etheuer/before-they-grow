import type { FamilyProfile, MemoryEntry } from './memoryRepository'

export type PortableExport = {
  version: 1
  exportedAt: string
  profile: FamilyProfile
  memories: Array<
    Omit<MemoryEntry, 'audio'> & {
      audio: null | {
        mimeType: string
        dataBase64: string
      }
    }
  >
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...Array.from(chunk))
  }
  return btoa(binary)
}

export async function buildPortableExport(
  profile: FamilyProfile,
  memories: MemoryEntry[],
  exportedAt = new Date(),
): Promise<PortableExport> {
  return {
    version: 1,
    exportedAt: exportedAt.toISOString(),
    profile,
    memories: await Promise.all(
      memories.map(async ({ audio, ...memory }) => ({
        ...memory,
        audio: audio
          ? {
              mimeType: audio.type || 'application/octet-stream',
              dataBase64: bytesToBase64(
                new Uint8Array(await audio.arrayBuffer()),
              ),
            }
          : null,
      })),
    ),
  }
}

export function downloadPortableExport(
  portableExport: PortableExport,
  filename = 'before-they-grow-export.json',
): void {
  const blob = new Blob([JSON.stringify(portableExport, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
