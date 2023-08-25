import http from 'node:http'
import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const { PORT = 8000 } = process.env
const PRERENDER_USER_AGENT = 'Prerender'

const browser = await puppeteer.launch({ headless: 'new' })

console.log('Started Headless Chrome')

const server = http.createServer(async (req, res) => {
  const { url, width = 1440 } = Object.fromEntries(
    req.url
      .split('?')[1]
      .split('&')
      .map(param => param.split('='))
  )

  const page = await browser.newPage()

  try {
    console.log(`Requesting ${url}`)

    await page.setUserAgent(PRERENDER_USER_AGENT)
    await page.setViewport({ width: Number(width), height: 768 })
    await page.setRequestInterception(true)

    page.on('request', interceptedRequest => {
      if (interceptedRequest.isInterceptResolutionHandled()) return
      if (resourcesToBlock.some(resource => interceptedRequest.url().endsWith(resource))) interceptedRequest.abort()
      else interceptedRequest.continue()
    })

    await page.goto(url)
    await page.deleteCookie(...(await page.cookies()))
    await page.evaluate(() => localStorage.clear())
    await page.waitForNetworkIdle({ idleTime: 100 })

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
})

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))
