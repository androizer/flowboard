export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/api/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  maxWorkers: 1,
  testTimeout: 30000,
};
