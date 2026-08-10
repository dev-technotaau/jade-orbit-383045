/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    roots: ['<rootDir>/src'],
    // tsconfig declares paths: { "@/*": ["src/*"] } and the build resolves them
    // with tsc-alias, so a test importing '@/…' must resolve here too. Nothing
    // uses it yet; without this the first file that does fails confusingly.
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    // Transpile only — no per-file type-check. `tsc --noEmit` already checks the
    // whole project once (npm run type-check); ts-jest was re-doing that work for
    // every test file, which took the suite from seconds to over two minutes and
    // made it too slow to run habitually. `isolatedModules` is set in
    // tsconfig.json, which is where ts-jest now wants it.
    transform: {
        '^.+\.ts$': ['ts-jest', {}],
    },
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.d.ts'],
};
