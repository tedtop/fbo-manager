import 'server-only'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DOC_MODULES, type DocModule, getDocModule } from './registry'
import { type DocFrontMatter, parseDoc } from './parse'

// Markdown lives in frontend/content/docs/<module>/<slug>.md (inside frontend/ so the Railway build has it).
const CONTENT_ROOT = path.join(process.cwd(), 'content', 'docs')

export type LoadedDoc = { slug: string; meta: DocFrontMatter; body: string }
export type LoadedModuleDocs = { module: DocModule; docs: LoadedDoc[] }

/** Reads and parses every registered doc of a module, sorted by front matter `order`. Null = unknown module. */
export function loadModuleDocs(moduleId: string): LoadedModuleDocs | null {
  const module = getDocModule(moduleId)
  if (!module) return null
  const docs = module.docs
    .map((slug) => {
      const source = readFileSync(path.join(CONTENT_ROOT, module.id, `${slug}.md`), 'utf8')
      return { slug, ...parseDoc(source) }
    })
    .sort((a, b) => a.meta.order - b.meta.order)
  return { module, docs }
}

export function docModuleIds(): string[] {
  return DOC_MODULES.map((m) => m.id)
}
