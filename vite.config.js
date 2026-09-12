import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the same build works locally and under the
  // /<repo>/ path GitHub Pages serves a project site from.
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
