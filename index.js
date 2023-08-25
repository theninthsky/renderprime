import puppeteer from 'puppeteer'

import resourcesToBlock from './utils/resourcesToBlock.js'
import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const launch = async () => {
  const browser = await puppeteer.launch({ headless: 'new' })

  console.log('Started Headless Chrome')

  const page = await browser.newPage()

  await page.setViewport({ width: 1440, height: 768 })
  await page.setRequestInterception(true)

  page.on('request', interceptedRequest => {
    if (interceptedRequest.isInterceptResolutionHandled()) return
    if (resourcesToBlock.some(resource => interceptedRequest.url().endsWith(resource))) interceptedRequest.abort()
    else interceptedRequest.continue()
  })

  await page.goto('https://client-side-rendering.pages.dev/web-vitals')
  await page.deleteCookie(...(await page.cookies()))
  await page.evaluate(() => {
    localStorage.clear()
    window.prerender = true
  })
  await page.waitForNetworkIdle({ idleTime: 200 })

  let html = await page.evaluate(() => document.documentElement.outerHTML)

  html = removeScriptTags(html)
  html = removePreloads(html)

  console.log(html)

  page.close()
  browser.close()
}

launch()
