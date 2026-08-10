import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperty(globalThis, 'Blob', {
  configurable: true,
  value: NodeBlob,
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
