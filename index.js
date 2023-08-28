import http from 'node:http'
import url from 'node:url'
import PQueue from 'p-queue'
import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const { PORT = 8000, USER_AGENT = 'Prerender', WEBSITE_URL, WAIT_AFTER_LAST_REQUEST = 200 } = process.env

const queue = new PQueue({ concurrency: 1, timeout: 30 * 1000 })
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

const server = http.createServer(async (req, res) => {
  if (!req.url.includes('?url=')) {
    res.writeHead(400)
    return res.end()
  }

  const { url: websiteUrl } = url.parse(req.url, true).query

  console.log(`Requesting ${websiteUrl}`)

  try {
    let html = await queue.add(() => renderPage(websiteUrl))

    html = removeScriptTags(html)
    html = removePreloads(html)

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    console.log(`Request sent for ${websiteUrl}\n`)
  } catch (err) {
    console.error(err)

    res.writeHead(503)
    res.end()
  }
})

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))
