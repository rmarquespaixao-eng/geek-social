import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/modules/**/*.test.ts', 'tests/integration/**/*.test.ts'],
          environment: 'node',
          globals: true,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.e2e.test.ts'],
          globalSetup: ['tests/e2e/setup/global-setup.ts'],
          globals: true,
          pool: 'forks',
          fileParallelism: false,
          testTimeout: 30000,
          env: {
            DATABASE_URL: 'postgresql://dev:dev@localhost:5432/geek_social_test',
            SES_FROM_EMAIL: 'noreply@test.com',
          },
        },
      },
    ],
  },
})
