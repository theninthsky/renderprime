<h1 align="center">Renderprime</h1>

This project aims to create the fastest prerender server possible.
<br>
It leaverages caching and uses functional navigations to achieve unmatched performance, far exceeding tools like _[Prerender](https://github.com/prerender/prerender)_ and _[Rendertron](https://github.com/GoogleChrome/rendertron)_.

You only have to make sure that your app has no memory leaks and that memory doesn't build up through page navigations.

- [Environment Variables](#environment-variables)
- [Exposing Navigation Function](#Exposing-navigation-function)
- [Deploying](#deploying)
- [Benchmarks](#benchmarks)

# Environment Variables

`CPUS`: The number of tabs to open. Each tab will operate in a different CPU core to ensure maximum performance (default: `numCPUs - 1`).

`PORT`: The port which the server will listen to (default: `8000`).

`RATE_LIMIT`: The maximum number of requests in the queue (default: `CPUS * 20`, so 20 requests per tab).

`USER_AGENT`: The `navigator.userAgent` string that will be injected to the browser during rendering (default: `Prerender`).

`WEBSITE_URL`: The website to render. Will be loaded to immediately in order to fetch and cache all assets.

`WAIT_AFTER_LAST_REQUEST`: The number of milliseconds to wait after the last request before snapshotting the DOM. This has tight correlation to the CPU power (default: `200`).

`WAIT_AFTER_LAST_REQUEST_TIMEOUT`: For how many milliseconds should the browser wait for the last request to return before giving up and snapshotting the DOM anyway (default: `5000`).

# Exposing Navigation Function

# Deploying

# Benchmarks
