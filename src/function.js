import http from 'node:http'
import url from 'node:url'
import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const { USER_AGENT = 'Prerender', WAIT_AFTER_LAST_REQUEST = 200, WAIT_AFTER_LAST_REQUEST_TIMEOUT = 5000 } = process.env

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const [page] = await browser.pages()

await page.setUserAgent(USER_AGENT)
await page.setViewport({ width: 1440, height: 768 })
await page.setRequestInterception(true)

page.on('request', interceptedRequest => {
  if (interceptedRequest.isInterceptResolutionHandled()) return
  if (resourcesToBlock.some(resource => interceptedRequest.url().endsWith(resource))) {
    return interceptedRequest.abort()
  }

  interceptedRequest.continue()
})

const server = http.createServer(async (req, res) => {
  const { query } = url.parse(req.url, true)

  if (!query.url) {
    res.writeHead(400)
    return res.end()
  }

  try {
    let html = await renderPage(query.url)

    html = removeScriptTags(html)
    html = removePreloads(html)

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    console.log(`Request sent for ${query.url}`)
  } catch (err) {
    console.error(err)

    res.writeHead(503)
    res.end()
  }
})

const renderPage = async websiteUrl => {
  console.log(`Requesting ${websiteUrl}`)

  let html

  try {
    await page.goto(websiteUrl)
    await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST, timeout: +WAIT_AFTER_LAST_REQUEST_TIMEOUT })

    html = await page.evaluate(() => document.documentElement.outerHTML)
  } catch (err) {
    console.error(err.message)

    html = await page.evaluate(() => document.documentElement.outerHTML)
  }

  return html
}

export const run = server
