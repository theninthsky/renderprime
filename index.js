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
  RATE_LIMIT = CPUS * 20,
  USER_AGENT = 'Prerender',
  WEBSITE_URL,
  WAIT_AFTER_LAST_REQUEST = 100,
  WAIT_AFTER_LAST_REQUEST_TIMEOUT = 5000
} = process.env

const tabs = []
const queue = new PQueue({ concurrency: +CPUS })
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

const openPage = async () => {
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

  return page
}

for (let i = 0; i < +CPUS; i++) tabs.push({ index: i, page: await openPage(), active: false })

const [emptyTab] = await browser.pages()

emptyTab.close()

console.log(`Started ${await browser.version()} (${CPUS} tabs)`)

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true)

  if (pathname === '/reload') {
    await queue.onIdle()
    queue.pause()

    await Promise.all(tabs.map(({ page }) => page.reload()))

    console.log('\nReloaded all pages\n')

    queue.start()

    res.writeHead(200)
    return res.end()
  }

  if (!query.url) {
    res.writeHead(400)
    return res.end()
  }

  if (queue.size > +RATE_LIMIT) {
    res.writeHead(529)
    return res.end()
  }

  try {
    let { html, tabIndex } = await queue.add(() => renderPage(query.url))

    html = removeScriptTags(html)
    html = removePreloads(html)

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    console.log(`Request sent for ${query.url} (#${tabIndex})`)
  } catch (err) {
    console.error(err)

    res.writeHead(503)
    res.end()
  }
})

const renderPage = async websiteUrl => {
  const tab = tabs.find(({ active }) => !active)
  const { index, page } = tab

  tab.active = true

  console.log(`Requesting ${websiteUrl} (#${index})`)

  let html

  try {
    await page.evaluate(
      ({ url, eventName }) => {
        return new Promise(resolve => {
          window.addEventListener(eventName, resolve)
          window.navigateTo(url)
        })
      },
      { url: websiteUrl, eventName: 'navigationend' }
    )
    await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST, timeout: +WAIT_AFTER_LAST_REQUEST_TIMEOUT })

    html = await page.evaluate(() => document.documentElement.outerHTML)
  } catch (err) {
    console.error(`${err.message} (#${index})`)

    html = await page.evaluate(() => document.documentElement.outerHTML)

    tab.page.close()

    tab.page = await openPage()
  }

  tab.active = false

  return { html, tabIndex: index }
}

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))
