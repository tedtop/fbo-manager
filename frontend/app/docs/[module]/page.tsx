import { DocMarkdown } from '@/components/docs/doc-markdown'
import { docModuleIds, loadModuleDocs } from '@/lib/docs/load'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamicParams = false

export function generateStaticParams() {
  return docModuleIds().map((module) => ({ module }))
}

export default async function ModuleDocsPage({ params }: { params: Promise<{ module: string }> }) {
  const { module: moduleId } = await params
  const loaded = loadModuleDocs(moduleId)
  if (!loaded) notFound()
  return (
    <div className="mx-auto space-y-10 p-6">
      <div className="flex items-center gap-4 text-sm">
        <Link href="/docs" className="text-primary underline">
          All documentation
        </Link>
        <Link href={loaded.module.route} className="text-primary underline">
          Open {loaded.module.title}
        </Link>
      </div>
      {loaded.docs.map((doc) => (
        <article key={doc.slug} id={doc.slug}>
          <h1 className="mb-4 text-2xl font-semibold">{doc.meta.title}</h1>
          <DocMarkdown body={doc.body} />
        </article>
      ))}
    </div>
  )
}
