import { availableParallelism } from 'node:os'
import http from 'node:http'
import url from 'node:url'
import PQueue from 'p-queue'
import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const numCPUs = availableParallelism()

const {
  CPUS = Math.min(numCPUs - 1, 10),
  PORT = 8000,
  RATE_LIMIT = 100,
  USER_AGENT = 'Prerender',
  WEBSITE_URL,
  WAIT_AFTER_LAST_REQUEST = 200,
  WAIT_AFTER_LAST_REQUEST_TIMEOUT = 5000
} = process.env

const tabs = []
const queue = new PQueue({ concurrency: +CPUS })
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

for (let i = 0; i < +CPUS; i++) {
  const page = await browser.newPage()

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

  tabs.push({ id: i + 1, page, active: false })
}

const [emptyTab] = await browser.pages()

emptyTab.close()

console.log(`Started ${await browser.version()} (${CPUS} tabs)`)

const server = http.createServer(async (req, res) => {
  if (!req.url.includes('?url=')) {
    res.writeHead(400)
    return res.end()
  }

  if (queue.size > +RATE_LIMIT) {
    res.writeHead(529)
    return res.end()
  }

  const { url: websiteUrl } = url.parse(req.url, true).query

  try {
    let { html, tabID } = await queue.add(() => renderPage(websiteUrl))

    html = removeScriptTags(html)
    html = removePreloads(html)

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    console.log(`Request sent for ${websiteUrl} (#${tabID})`)
  } catch (err) {
    console.error(err)

    res.writeHead(503)
    res.end()
  }
})

const renderPage = async websiteUrl => {
  const tab = tabs.find(({ active }) => !active)
  const { id: tabID, page } = tab

  tab.active = true

  console.log(`Requesting ${websiteUrl} (#${tabID})`)

  await page.evaluate(url => window.navigateTo(url), websiteUrl)

  try {
    await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST, timeout: +WAIT_AFTER_LAST_REQUEST_TIMEOUT })
  } catch (err) {
    console.error(`${err.message} (#${tabID})`)
  }

  const html = await page.evaluate(() => document.documentElement.outerHTML)
  await page.reload()

  tab.active = false

  return { html, tabID }
}

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))
