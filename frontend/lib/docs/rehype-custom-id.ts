// Rehype plugin: a trailing "{#custom-id}" on a heading becomes that heading's id and is removed from the
// text, so prose can be reworded without breaking links. Runs before rehype-slug, which leaves headings
// that already have an id alone.

type HastNode = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const CUSTOM_ID = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/

function walk(node: HastNode) {
  if (node.type === 'element' && node.tagName && /^h[1-6]$/.test(node.tagName)) {
    const last = node.children?.[node.children.length - 1]
    if (last?.type === 'text' && last.value) {
      const m = CUSTOM_ID.exec(last.value)
      if (m) {
        last.value = last.value.replace(CUSTOM_ID, '')
        node.properties = { ...node.properties, id: m[1] }
      }
    }
    return
  }
  for (const child of node.children ?? []) walk(child)
}

export function rehypeCustomId() {
  return (tree: HastNode) => walk(tree)
}
