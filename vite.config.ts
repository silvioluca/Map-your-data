import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Su GitHub Pages il sito è servito da https://<utente>.github.io/Map-your-data/, non dalla radice.
  base: process.env.GITHUB_ACTIONS ? '/Map-your-data/' : '/',
  plugins: [react()],
})
