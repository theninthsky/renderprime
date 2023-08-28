import http from 'node:http'
import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const {
  PORT = 8000,
  PRERENDER_USER_AGENT = 'Prerender',
  WEBSITE_URL,
  WAIT_AFTER_LAST_REQUEST = 200,
  NUMBER_OF_TABS = 5
} = process.env

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

console.log(`Started ${await browser.version()}`)

const tabs = []

new Array(+NUMBER_OF_TABS).fill().forEach(async (_, ind) => {
  const page = await browser.newPage()

  await page.setUserAgent(PRERENDER_USER_AGENT)
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

  tabs.push({
    id: ind + 1,
    page,
    active: false
  })

  console.log(`Tab ${ind + 1} is open`)
})

const server = http.createServer(async (req, res) => {
  if (!req.url.includes('?url=')) {
    res.writeHead(400)
    return res.end()
  }

  const { url } = Object.fromEntries(
    decodeURIComponent(req.url)
      .split('?')[1]
      .map(param => param.split('='))
  )

  console.log(`Requesting ${url}`)

  const tab = tabs.find(({ active }) => !active)

  if (!tab) {
    console.log(`Too many requests!\n`)

    res.writeHead(429)
    return res.end()
  }

  const { id, page } = tab
  tab.active = true

  try {
    await page.evaluate(url => window.navigateTo(url), url)
    await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST })

    let html = await page.evaluate(() => document.documentElement.outerHTML)

    html = removeScriptTags(html)
    html = removePreloads(html)

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    console.log(`Request sent for ${url} (Tab ${id})\n`)
  } catch (err) {
    console.error(err)

    res.writeHead(404)
    res.end()
  }

  tab.active = false
})

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))
