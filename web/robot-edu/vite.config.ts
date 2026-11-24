import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    // One jsdom per worker: with a worker per core the full suite saturates CPU and memory on a 12-core, 14 GB machine, and the heaviest
    // specs (CourseContentEditor) then exceed the 5 s test timeout although they take about 0.2 s alone. Fewer workers, same timeouts.
    poolOptions: { forks: { minForks: 1, maxForks: 6 } },
  },
})
