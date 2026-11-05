// Pure helpers for the Markdown docs (D11, B27a): hand-parsed front matter and heading ids. No fs and no
// server-only import, so the loader and the vitest docs test share exactly the same parsing.

import GithubSlugger from 'github-slugger'

export type DocFrontMatter = {
  title: string
  module: string
  order: number
  anchors: string[]
}

export type ParsedDoc = { meta: DocFrontMatter; body: string }

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const CUSTOM_ID = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/

/** Splits and validates the fixed-key front matter block. Throws a descriptive Error on any problem. */
export function parseDoc(source: string): ParsedDoc {
  const match = FRONT_MATTER.exec(source)
  if (!match) throw new Error('missing front matter block')
  const raw: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    if (colon < 1) throw new Error(`bad front matter line: "${line}"`)
    raw[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  for (const key of Object.keys(raw)) {
    if (!['title', 'module', 'order', 'anchors'].includes(key)) {
      throw new Error(`unknown front matter key: ${key}`)
    }
  }
  const { title, module, order, anchors } = raw
  if (!title) throw new Error('front matter: title is required')
  if (!module) throw new Error('front matter: module is required')
  if (!/^\d+$/.test(order ?? '')) throw new Error('front matter: order must be a whole number')
  if (!anchors || !/^\[.*\]$/.test(anchors)) {
    throw new Error('front matter: anchors must be a [a, b, c] list')
  }
  const list = anchors
    .slice(1, -1)
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  return {
    meta: { title, module, order: Number(order), anchors: list },
    body: source.slice(match[0].length)
  }
}

/**
 * The heading ids the renderer will produce: a trailing {#custom-id} wins, otherwise the github-slugger
 * slug (the same one rehype-slug uses, with the same de-duplication). Fenced code blocks are skipped.
 */
export function headingsOf(body: string): { depth: number; text: string; id: string }[] {
  const slugger = new GithubSlugger()
  const out: { depth: number; text: string; id: string }[] = []
  let fenced = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (!h) continue
    const custom = CUSTOM_ID.exec(h[2])
    const text = h[2].replace(CUSTOM_ID, '').trim()
    out.push({ depth: h[1].length, text, id: custom ? custom[1] : slugger.slug(text) })
  }
  return out
}

/** `module:<id>` and `doc:<module>/<slug>[#anchor]` link targets found in Markdown links. */
export function internalLinksOf(body: string): string[] {
  return [...body.matchAll(/\]\(((?:module|doc):[^)\s]+)\)/g)].map((m) => m[1])
}
