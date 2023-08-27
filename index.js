import http from 'node:http'
import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const {
  PORT = 8000,
  PRERENDER_USER_AGENT = 'Prerender',
  WAIT_AFTER_LAST_REQUEST = 200,
  MAX_OPEN_TABS = 20
} = process.env

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

let emptyTab = await browser.newPage()
let numOfOpenTabs = 1

console.log(`Started ${await browser.version()}`)

const server = http.createServer(async (req, res) => {
  if (!req.url.includes('?url=')) {
    res.writeHead(400)
    return res.end()
  }

  const { url, width = 1440 } = Object.fromEntries(
    decodeURIComponent(req.url)
      .split('?')[1]
      .split('&')
      .map(param => param.split('='))
  )

  console.log(`Requesting ${url}`)

  if (numOfOpenTabs === MAX_OPEN_TABS) {
    console.log(`Too many requests!\n`)

    res.writeHead(429)
    return res.end()
  }

  let page

  if (emptyTab) {
    page = emptyTab
    emptyTab = null
  } else {
    page = await browser.newPage()
    numOfOpenTabs++
  }

  try {
    await page.setUserAgent(PRERENDER_USER_AGENT)
    await page.setViewport({ width: Number(width), height: 768 })
    await page.setRequestInterception(true)

    page.on('request', interceptedRequest => {
      if (interceptedRequest.isInterceptResolutionHandled()) return
      if (resourcesToBlock.some(resource => interceptedRequest.url().endsWith(resource))) interceptedRequest.abort()
      else interceptedRequest.continue()
    })

    await page.goto(url)
    await page.waitForNetworkIdle({ idleTime: WAIT_AFTER_LAST_REQUEST })

    let html = await page.evaluate(() => document.documentElement.outerHTML)

    html = removeScriptTags(html)
    html = removePreloads(html)

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    console.log(`Request sent for ${url}\n`)
  } catch (err) {
    console.error(err)

    res.writeHead(404)
    res.end()
  }

  page.close()
  numOfOpenTabs--

  if (!emptyTab) {
    emptyTab = await browser.newPage()
    numOfOpenTabs++
  }
})

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))
