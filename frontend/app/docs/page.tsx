import { DOC_MODULES } from '@/lib/docs/registry'
import Link from 'next/link'

export const metadata = { title: 'Documentation' }

export default function DocsIndexPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Documentation</h1>
      <ul className="space-y-2">
        {DOC_MODULES.map((m) => (
          <li key={m.id}>
            <Link href={`/docs/${m.id}`} className="text-primary underline">
              {m.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
