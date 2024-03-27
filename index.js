import url from 'node:url'
import PQueue from 'p-queue'
import puppeteer from 'puppeteer'
import functions from '@google-cloud/functions-framework'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const { USER_AGENT = 'Prerender', WAIT_AFTER_LAST_REQUEST = 200, WAIT_AFTER_LAST_REQUEST_TIMEOUT = 10000 } = process.env

const queue = new PQueue({ concurrency: 1 })
const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
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

functions.http('render', async (req, res) => {
  const { query } = url.parse(req.url, true)
  const websiteUrl = query.url

  if (!websiteUrl) {
    res.writeHead(400)
    return res.end()
  }

  console.log(`Requesting ${websiteUrl}`)

  const html = await queue.add(() => renderPage(websiteUrl))

  if (html) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    console.log(`Request sent for ${websiteUrl}`)
  } else {
    res.writeHead(500)
    res.end()
  }
})

const renderPage = async websiteUrl => {
  try {
    page.goto(websiteUrl)
    await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST, timeout: +WAIT_AFTER_LAST_REQUEST_TIMEOUT })

    let html = await page.evaluate(() => document.documentElement.outerHTML)
    html = removeScriptTags(html)
    html = removePreloads(html)

    return html
  } catch (err) {
    console.error(err.message)
  }
}
