export default {
  mutate: ['src/appLock.ts'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress'],
  thresholds: {
    high: 80,
    low: 60,
    break: 60,
  },
}
