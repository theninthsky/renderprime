import { availableParallelism } from 'node:os'
import url from 'node:url'
import PQueue from 'p-queue'
import puppeteer from 'puppeteer'
import functions from '@google-cloud/functions-framework'

import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const {
  MAX_PAGES = availableParallelism() - 1,
  USER_AGENT = 'Prerender',
  WAIT_AFTER_LAST_REQUEST = 200,
  WAIT_AFTER_LAST_REQUEST_TIMEOUT = 5000
} = process.env
const allowlist = ['document', 'script', 'xhr', 'fetch', 'other']
const blockList = ['.ico']

const queue = new PQueue({ concurrency: MAX_PAGES })
const browser = await puppeteer.launch({ args: ['--disable-gpu', '--no-first-run', '--no-sandbox'] })
const availablePages = []

const initializePage = async existingPage => {
  const page = existingPage || (await browser.newPage())

  await page.setUserAgent(USER_AGENT)
  await page.setViewport({ width: 1440, height: 768 })
  await page.setRequestInterception(true)

  page.on('request', request => {
    if (request.isInterceptResolutionHandled()) return
    if (!allowlist.includes(request.resourceType()) || blockList.some(resource => request.url().endsWith(resource))) {
      return request.abort()
    }

    request.continue()
  })

  return page
}

const renderPage = async websiteUrl => {
  const page = availablePages.pop() || (await initializePage())

  try {
    await page.goto(websiteUrl)
    await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST, timeout: +WAIT_AFTER_LAST_REQUEST_TIMEOUT })
  } catch (err) {
    console.error(err.message)
  }

  let html = await page.content()

  availablePages.push(page)

  html = removeScriptTags(html)
  html = removePreloads(html)

  return html
}

availablePages.push(await initializePage((await browser.pages())[0]))

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
    res.writeHead(429)
    res.end()
  }
})
