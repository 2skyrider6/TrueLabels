const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
  // Test harness lives outside `src`, so it needs its own alias.
  '^@test/(.*)$': '<rootDir>/test/$1',
};

/**
 * Two projects, because the suite has two genuinely different needs.
 *
 * `unit` runs the pure logic (parser, engine, OFF client, storage) in plain Node
 * with ts-jest. It is fast and has no React Native runtime, so the safety-critical
 * pipeline tests stay cheap enough to run on every save.
 *
 * `ui` runs screens and hooks through jest-expo so React Native modules resolve,
 * with every native module replaced by a mock in test/setup.
 */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.test.ts'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      moduleNameMapper,
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
      },
      collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/test-utils/**'],
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      rootDir: __dirname,
      roots: ['<rootDir>/src', '<rootDir>/app', '<rootDir>/test'],
      testMatch: ['**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      moduleNameMapper,
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
      ],
      collectCoverageFrom: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/test-utils/**'],
    },
  ],
};