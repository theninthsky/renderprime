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
  CPUS = numCPUs - 1,
  PORT = 8000,
  RATE_LIMIT = 100,
  USER_AGENT = 'Prerender',
  WEBSITE_URL,
  WAIT_AFTER_LAST_REQUEST = 200
} = process.env

const tabs = []
const queue = new PQueue({ concurrency: +CPUS, timeout: 30 * 1000 })
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

const renderPage = async websiteUrl => {
  const tab = tabs.find(({ active }) => !active)

  tab.active = true

  try {
    await tab.page.evaluate(url => window.navigateTo(url), websiteUrl)
    await tab.page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST })
    const html = await tab.page.evaluate(() => document.documentElement.outerHTML)

    tab.active = false

    return { html, tabID: tab.id }
  } catch (err) {
    tab.active = false

    throw Error(err)
  }
}

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

  console.log(`Requesting ${websiteUrl}`)

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

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))
