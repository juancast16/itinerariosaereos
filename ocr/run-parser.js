import { spawn } from 'child_process'

spawn(
  'npx',
  ['ts-node', '--transpile-only', 'ocr/parse-itinerary.ts'],
  { stdio: 'inherit', shell: true }
)
