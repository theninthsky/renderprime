export default html => {
  const matches = html.match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/gi)

  for (const match of matches) html = html.replace(match, '')

  return html
}
