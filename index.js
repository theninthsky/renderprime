import { availableParallelism } from 'node:os'
import { fork } from 'node:child_process'
import PQueue from 'p-queue'
import http from 'node:http'
import url from 'node:url'

import removeScriptTags from './utils/removeScriptTags.js'
import removePreloads from './utils/removePreloads.js'

const numCPUs = availableParallelism()

const { CPUS = numCPUs - 1, PORT = 8000, RENDER_TIMEOUT = 10000 } = process.env

const children = []
const queue = new PQueue({ concurrency: +CPUS, timeout: 30 * 1000 })

for (let i = 0; i < +CPUS; i++) children.push({ id: i + 1, prerenderer: fork('prerenderer.js'), active: false })

const server = http.createServer(async (req, res) => {
  if (!req.url.includes('?url=')) {
    res.writeHead(400)
    return res.end()
  }

  queue.add(
    () =>
      new Promise((resolve, reject) => {
        const { url: websiteUrl } = url.parse(req.url, true).query

        console.log(`Requesting ${websiteUrl}`)

        const child = children.find(({ active }) => !active)

        child.active = true

        child.prerenderer.send(websiteUrl)

        const timeoutID = setTimeout(() => {
          console.error(`Render timeout [#${child.id}]`)

          res.writeHead(503)
          res.end()
          reject()
        }, +RENDER_TIMEOUT)

        child.prerenderer.once('message', html => {
          clearTimeout(timeoutID)

          child.active = false

          html = removeScriptTags(html)
          html = removePreloads(html)

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html)

          console.log(`Request sent for ${websiteUrl} [#${child.id}] `)

          resolve()
        })
      })
  )
})

server.listen(PORT, () => console.log(`Server is running on port ${PORT}\n`))

process.on('exit', () => children.forEach(child => child.kill(9)))
