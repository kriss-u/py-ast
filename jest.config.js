export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true
    }]
  },
  testMatch: [
    '**/src/**/__tests__/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts'
  ],
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  testTimeout: 10000, // 10 seconds for complex parsing tests
  verbose: true
};
