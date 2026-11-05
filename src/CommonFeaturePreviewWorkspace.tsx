import { useMemo, type ReactNode } from 'react'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import {
  formatCommonFeatureQualifierLines,
  recordFromCommonFeatureTemplate,
  type CommonFeatureTemplate,
} from './domain/commonFeatures'

type CommonFeaturePreviewWorkspaceProps = {
  template: CommonFeatureTemplate | null
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

export function CommonFeaturePreviewWorkspace({
  template,
  renderWorkspace,
}: CommonFeaturePreviewWorkspaceProps) {
  const record = useMemo(() => {
    if (!template) return null
    const preview = recordFromCommonFeatureTemplate(template)
    return { ...preview, id: `common-preview-${template.id}` }
  }, [template])
  const qualifierLines = template ? formatCommonFeatureQualifierLines(template) : []

  if (!template || !record) {
    return (
      <div className="common-feature-preview-workspace common-feature-preview-workspace-empty">
        <p>Select a feature to preview.</p>
      </div>
    )
  }

  return (
    <div className="common-feature-preview-workspace">
      <section className="common-feature-params-pane">
        <header className="common-feature-params-header">
          <strong>{template.name}</strong>
          <span>{template.type}</span>
        </header>
        <pre className="common-feature-params-body">
          {qualifierLines.length ? qualifierLines.join('\n') : 'No parameters'}
        </pre>
      </section>

      <section className="common-feature-view-pane">
        {renderWorkspace({
          record,
          title: template.name,
          selectedRange: null,
          cutStrandSelection: null,
          selectedSites: [],
          allowEnzymeSelect: false,
          showFeatureTranslations: true,
          initialTab: 'Sequence',
        })}
      </section>
    </div>
  )
}
