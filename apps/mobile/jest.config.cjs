module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@before-they-grow/application$': '<rootDir>/../../packages/application/src/index.ts',
    '^@before-they-grow/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@before-they-grow/domain$': '<rootDir>/../../packages/domain/src/index.ts',
  },
}
