import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { headingsOf, internalLinksOf, parseDoc } from '../parse'
import { DOC_MODULES } from '../registry'

const ROOT = path.join(process.cwd(), 'content', 'docs')
const MIN_LENGTH = 400
const REQUIRED_HEADINGS = ['Overview', 'Common tasks', 'Troubleshooting']
const STUB = /\b(TODO|TBD|FIXME|lorem ipsum|coming soon)\b/i

function read(moduleId: string, slug: string) {
  return readFileSync(path.join(ROOT, moduleId, `${slug}.md`), 'utf8')
}

describe('docs registry and content', () => {
  it('has no orphan doc folders or files', () => {
    const registered = new Set(DOC_MODULES.map((m) => m.id))
    for (const entry of readdirSync(ROOT)) {
      if (!statSync(path.join(ROOT, entry)).isDirectory()) continue
      expect(registered.has(entry), `folder content/docs/${entry} is not in the registry`).toBe(true)
      const module = DOC_MODULES.find((m) => m.id === entry)
      for (const file of readdirSync(path.join(ROOT, entry))) {
        expect(module?.docs.includes(file.replace(/\.md$/, '')), `${entry}/${file} is not registered`).toBe(true)
      }
    }
  })

  for (const module of DOC_MODULES) {
    describe(module.id, () => {
      const allAnchors = new Set<string>()

      for (const slug of module.docs) {
        it(`${slug}: exists, valid front matter, headings, anchors, links, not a stub`, () => {
          const source = read(module.id, slug)
          const { meta, body } = parseDoc(source)
          expect(meta.module).toBe(module.id)
          expect(source.length).toBeGreaterThanOrEqual(MIN_LENGTH)
          expect(STUB.test(body), 'doc contains placeholder text').toBe(false)

          const headings = headingsOf(body)
          const h2 = headings.filter((h) => h.depth === 2).map((h) => h.text)
          for (const required of REQUIRED_HEADINGS) expect(h2).toContain(required)
          if (module.id === 'flight-operations') expect(h2).toContain('Fields and rules')

          const ids = new Set(headings.map((h) => h.id))
          expect(ids.size).toBe(headings.length)
          for (const anchor of meta.anchors) {
            expect(ids.has(anchor), `anchor "${anchor}" has no heading`).toBe(true)
            allAnchors.add(anchor)
          }

          for (const link of internalLinksOf(body)) {
            if (link.startsWith('module:')) {
              expect(DOC_MODULES.some((m) => m.id === link.slice(7)), link).toBe(true)
            } else {
              const [target, anchor] = link.slice(4).split('#')
              const [mod, docSlug] = target.split('/')
              const found = DOC_MODULES.find((m) => m.id === mod)
              expect(found?.docs.includes(docSlug), link).toBe(true)
              if (anchor && found && docSlug) {
                const targetHeadings = headingsOf(parseDoc(read(mod, docSlug)).body)
                expect(targetHeadings.some((h) => h.id === anchor), link).toBe(true)
              }
            }
          }
        })
      }

      it('every registry help anchor is declared by a doc', () => {
        for (const anchor of module.helpAnchors) {
          expect(allAnchors.has(anchor), `helpAnchor "${anchor}" is not declared in any doc`).toBe(true)
        }
      })
    })
  }
})

describe('parseDoc', () => {
  it('rejects missing and unknown front matter', () => {
    expect(() => parseDoc('no front matter')).toThrow()
    expect(() => parseDoc('---\ntitle: a\nmodule: b\norder: 1\nanchors: []\nextra: x\n---\nbody')).toThrow(/unknown/)
  })
  it('honours {#custom-id} and slugs the rest', () => {
    const ids = headingsOf('## Add it {#add}\n\n## Add it\n\n```\n## code\n```').map((h) => h.id)
    expect(ids).toEqual(['add', 'add-it'])
  })
})
