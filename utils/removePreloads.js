export default html => {
  const matches = html.match(/<link[^>]+?rel="preload"[^>]*?>/gi)

  if (!matches) return html

  for (const match of matches) html = html.replace(match, '')

  return html
}
