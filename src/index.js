import { availableParallelism } from 'node:os'
import url from 'node:url'
import PQueue from 'p-queue'
import puppeteer from 'puppeteer'
import functions from '@google-cloud/functions-framework'

import { extensionBlockList, urlBlockList } from './block-lists.js'
import removeScriptTags from './utils/remove-script-tags.js'
import removePreloads from './utils/remove-preloads.js'

const {
  WEBSITE_URL,
  USER_AGENT = 'Prerender',
  WAIT_AFTER_LAST_REQUEST = 200,
  WAIT_AFTER_LAST_REQUEST_TIMEOUT = 5000
} = process.env

const allowlist = ['document', 'script', 'xhr', 'fetch', 'other']

const queue = new PQueue({ concurrency: availableParallelism() })
const browserPromise = puppeteer.launch({ headless: 'shell', args: ['--disable-gpu', '--no-sandbox'] })
const documentPromise = WEBSITE_URL ? fetch(WEBSITE_URL) : undefined

const [browser, document] = await Promise.all([browserPromise, documentPromise])
const documentResponse = document ? { ...document, body: await document.text() } : undefined

const pages = await browser.pages()

console.log(`Concurrency: ${availableParallelism()}`)

if (document) console.log(`Cached HTML document for ${WEBSITE_URL}`)

const initializePage = async () => {
  const page = await browser.newPage()

  await page.setUserAgent(USER_AGENT)
  await page.setViewport({ width: 1440, height: 768 })
  await page.setRequestInterception(true)

  page.on('request', request => {
    if (request.isInterceptResolutionHandled()) return
    if (request.resourceType() === 'document' && new URL(request.url()).origin === WEBSITE_URL) {
      return request.respond(documentResponse)
    }
    if (
      !allowlist.includes(request.resourceType()) ||
      extensionBlockList.some(ext => request.url().endsWith(ext)) ||
      urlBlockList.some(url => request.url().includes(url))
    ) {
      return request.abort()
    }

    request.continue()
  })

  pages.push(page)

  return page
}

const getAvailablePage = () => pages.find(({ processing }) => !processing)

const renderPage = async websiteUrl => {
  const page = getAvailablePage() || (await initializePage())
  page.processing = true

  const startTime = new Date()

  try {
    await page.goto(websiteUrl)
    await page.waitForNetworkIdle({ idleTime: +WAIT_AFTER_LAST_REQUEST, timeout: +WAIT_AFTER_LAST_REQUEST_TIMEOUT })
  } catch (err) {
    console.error(err.message)
  }

  console.log(`${websiteUrl} rendered in ${new Date() - startTime}ms`)

  let html = await page.content()
  html = removeScriptTags(html)
  html = removePreloads(html)

  page.processing = false

  return html
}

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