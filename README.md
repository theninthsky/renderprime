<h1 align="center">Renderprime</h1>

A high performance and serverless prerenderer built as a GCP _[Cloud Function](https://cloud.google.com/functions)_.

## Features

- Asset caching through the default browser caching behavior.
- HTML document caching for instant app shell rendering. The document is revalidated every 10 minutes.
- Render parallelization up to the value of `availableParallelism`.

## Getting Started

### Installation

```sh
git clone https://github.com/theninthsky/renderprime.git
npm i
```

### Running Locally

```sh
npm start
```

### Environment Variables

`WEBSITE_URL`: The URL of the website without `/` at the end. Providing it will cause the HTML document to be cached, thus greatly reducing response times (default: `undefined`).

`USER_AGENT`: The `navigator.userAgent` string that will be injected to the browser during rendering (default: `Prerender`).

`WAIT_AFTER_LAST_REQUEST`: The number of milliseconds to wait after the last request before snapshotting the DOM. This has tight correlation to the CPU power (default: `200`).

`WAIT_AFTER_LAST_REQUEST_TIMEOUT`: For how many milliseconds should the browser wait for the last request to return before giving up and snapshotting the DOM anyway (default: `5000`).

### Blocking Resources

Any request that does not render data on the screen should be blocked, this will allow the prerenderer to snapshot the page much faster.

Inside _[blocklists.js](src/blocklists.js)_ you will find two arrays: `extensionBlocklist` and `urlBlocklist`.
<br>
These will allow you to block resources by file extension and URL respectively.

## Recommended Cloud Function Setup

`Memory allocated`: 1GB
<br>
`CPU`: 2
<br>
`Maximum concurrent requests per instance`: 4 (should match the `availableParallelism` of the CPU)
