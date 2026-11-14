import { rehypeCustomId } from '@/lib/docs/rehype-custom-id'
import { getDocModule } from '@/lib/docs/registry'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

// Renders one doc body. Link schemes: `module:<id>` opens the module's route, `doc:<module>/<slug>#anchor`
// opens that doc's full page, http(s) opens in a new tab. Raw HTML in the Markdown is not rendered.
export function DocMarkdown({
  body,
  onDocLink,
  onModuleLink
}: {
  body: string
  /** Panel mode: `doc:<module>/<slug>#anchor` links call this instead of navigating to the full page. */
  onDocLink?: (moduleId: string, anchor?: string) => void
  /** Panel mode: called when a `module:<id>` link is followed (to close the panel on small screens). */
  onModuleLink?: () => void
}) {
  return (
    <div className="docs-prose max-w-3xl space-y-3 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[0.85em] [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:p-2 [&_h2]:scroll-mt-20 [&_h3]:scroll-mt-20">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeCustomId, rehypeSlug]}
        components={{
          a({ href = '', children }) {
            if (href.startsWith('module:')) {
              const mod = getDocModule(href.slice('module:'.length))
              return <Link href={mod?.route ?? '/'} onClick={onModuleLink} className="text-primary underline">{children}</Link>
            }
            if (href.startsWith('doc:')) {
              if (onDocLink) {
                const [target, anchor] = href.slice('doc:'.length).split('#')
                return (
                  <a
                    href={`/docs/${target.split('/')[0]}`}
                    className="text-primary underline"
                    onClick={(e) => {
                      e.preventDefault()
                      onDocLink(target.split('/')[0], anchor)
                    }}
                  >
                    {children}
                  </a>
                )
              }
              return <Link href={`/docs/${href.slice('doc:'.length).split('/')[0]}`} className="text-primary underline">{children}</Link>
            }
            if (/^https?:/.test(href)) {
              return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>
            }
            return <a href={href} className="text-primary underline">{children}</a>
          }
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
