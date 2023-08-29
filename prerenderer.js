import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'

const { USER_AGENT = 'Prerender', WEBSITE_URL, WAIT_AFTER_LAST_REQUEST = 200 } = process.env

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const [page] = await browser.pages()

await page.setUserAgent(USER_AGENT)
await page.setViewport({ width: 1440, height: 768 })
await page.setRequestInterception(true)

page.goto(WEBSITE_URL)

page.on('request', interceptedRequest => {
  if (interceptedRequest.isInterceptResolutionHandled()) return
  if (resourcesToBlock.some(resource => interceptedRequest.url().endsWith(resource))) {
    return interceptedRequest.abort()
  }

  interceptedRequest.continue()
})

console.log(`Started ${await browser.version()}`)

const renderPage = async websiteUrl => {
  await page.evaluate(url => window.navigateTo(url), websiteUrl)
  await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST })

  return await page.evaluate(() => document.documentElement.outerHTML)
}

process.on('message', async websiteUrl => {
  const html = await renderPage(websiteUrl)

  process.send(html)
})
