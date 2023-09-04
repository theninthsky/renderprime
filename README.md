<h1 align="center">Renderprime</h1>

This project aims to create the fastest prerender server possible.
<br>
It leaverages caching and uses functional navigations to achieve unmatched performance, far exceeding tools like _[Prerender](https://github.com/prerender/prerender)_ and _[Rendertron](https://github.com/GoogleChrome/rendertron)_.

You only have to make sure that your app has no memory leaks and that memory doesn't build up through page navigations.

- [Environment Variables](#environment-variables)
- [Exposing Navigation Function](#exposing-navigation-function)
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

In order to load pages quickly, our Single-Page Application shouldn't be reloaded for every navigation. Instead, the app should use its internal (functional) navigation, like it does for a real user.

We only need to expose a global navigation function called `navigateTo` and Renderprime will do the rest for us.

This is an example using React 18:

_**hooks/useTransitionNavigate.ts**_

```js
import { useTransition } from 'react'
import { useNavigate, To, NavigateOptions } from 'react-router-dom'

const useTransitionNavigate = () => {
  const [, startTransition] = useTransition()
  const navigate = useNavigate()

  return (to: To, options?: NavigateOptions) => startTransition(() => navigate(to, options))
}

export default useTransitionNavigate
```

_**hooks/useExposeNavigationFunction.ts**_

```js
import useTransitionNavigate from 'hooks/useTransitionNavigate'

const useExposeNavigationFunction = () => {
  const navigate = useTransitionNavigate()

  window['navigateTo'] = (url: string) => navigate(url.replace(window.location.origin, ''), { replace: true })
}

export default useExposeNavigationFunction
```

_**App.tsx**_

```js
import useExposeNavigationFunction from 'hooks/useExposeNavigationFunction'

const App: FC<{}> = () => {
  useExposeNavigationFunction()

  return (
    ...
  )
}

export default App
```

It is important to use transitioning since it is the most accurate indication that a navigation has finished.

# Deploying

# Benchmarks
