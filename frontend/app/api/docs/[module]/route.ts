import { docModuleIds, loadModuleDocs } from '@/lib/docs/load'
import { NextResponse } from 'next/server'

// GET /api/docs/<module>: the parsed docs of one module for the slide-in panel.
// Static (built once, no runtime fs). Sign-in is enforced in middleware.ts for /api/docs, because a
// force-static handler cannot read the session cookie itself.
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return docModuleIds().map((module) => ({ module }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module: moduleId } = await params
  const loaded = loadModuleDocs(moduleId)
  if (!loaded) return NextResponse.json({ error: 'Unknown documentation module' }, { status: 404 })
  return NextResponse.json({
    module: { id: loaded.module.id, title: loaded.module.title, route: loaded.module.route },
    docs: loaded.docs.map((d) => ({
      slug: d.slug,
      title: d.meta.title,
      anchors: d.meta.anchors,
      markdown: d.body
    }))
  })
}
