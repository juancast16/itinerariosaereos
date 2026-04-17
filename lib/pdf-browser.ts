import fs from 'fs'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const LOCAL_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

function resolveLocalBrowserPath() {
  for (const browserPath of LOCAL_BROWSER_PATHS) {
    if (browserPath && fs.existsSync(browserPath)) {
      return browserPath
    }
  }
  return null
}

export async function launchPdfBrowser() {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER

  if (!isProduction) {
    const localBrowserPath = resolveLocalBrowserPath()
    if (localBrowserPath) {
      return puppeteer.launch({
        executablePath: localBrowserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    }
  }

  const executablePath = await chromium.executablePath()

  return puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    executablePath,
    headless: true,
  })
}
