import type { ReactNode } from 'react'

export type LibrarySequenceBlock = {
  key: string
  title: string
  meta: string
  body: ReactNode
  isConsensus?: boolean
  /** Compact header actions (e.g. Flip) — stopPropagation handled by the stack. */
  actions?: ReactNode
}

/** Compact stacked layout for consensus + library members in Sequence pane (alignment off). */
export function LibrarySequenceStack({
  blocks,
  activeKey,
  onActivate,
}: {
  blocks: LibrarySequenceBlock[]
  activeKey?: string | null
  onActivate?: (key: string) => void
}) {
  return (
    <div className="library-sequence-stack">
      {blocks.map((block) => {
        const isActive = activeKey != null && activeKey === block.key
        return (
          <section
            key={block.key}
            data-library-key={block.key}
            className={`library-sequence-block${block.isConsensus ? ' library-sequence-block-consensus' : ''}${isActive ? ' is-active' : ''}`}
            aria-label={block.title}
            aria-current={isActive ? 'true' : undefined}
          >
            <div
              className="library-sequence-block-header"
              onPointerDown={onActivate ? () => onActivate(block.key) : undefined}
            >
              <span className="library-sequence-block-name" title={block.title}>
                {block.title}
              </span>
              {block.actions ? (
                <div
                  className="library-sequence-block-actions"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {block.actions}
                </div>
              ) : null}
              <span className="library-sequence-block-meta">{block.meta}</span>
            </div>
            {block.body}
          </section>
        )
      })}
    </div>
  )
}
