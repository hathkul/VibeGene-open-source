import type { ComponentProps } from 'react'
import type { PcrRecipeDialog } from '../PcrRecipeDialog'
import { readAppPreferences } from '../domain/appPreferences'
import { lazyDialog } from '../ui/lazyDialog'

const LazyDialog = lazyDialog(
  () => import('../PcrRecipeDialog'),
  (module) => module.PcrRecipeDialog,
)

type Props = Pick<ComponentProps<typeof PcrRecipeDialog>, 'recipe' | 'onClose'>

/** Lazy PCR recipe dialog; a failed chunk load logs and dismisses the dialog. */
export function LazyPcrRecipeDialog({ recipe, onClose }: Props) {
  return (
    <LazyDialog
      recipe={recipe}
      mixDefaults={readAppPreferences().pcr}
      onClose={onClose}
      onLoadError={(error) => {
        console.error('Could not load the PCR recipe dialog.', error)
        onClose()
      }}
    />
  )
}
