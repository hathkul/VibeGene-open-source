import type { HTMLAttributes } from 'react'

function classes(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function DialogBackdrop({ className, role = 'presentation', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('translation-dialog-backdrop', className)} role={role} {...props} />
}

export function DialogSurface({
  className,
  onPointerDown,
  role = 'dialog',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={classes('translation-dialog', className)}
      role={role}
      aria-modal="true"
      onPointerDown={(event) => {
        event.stopPropagation()
        onPointerDown?.(event)
      }}
      {...props}
    />
  )
}

export function DialogActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('translation-actions', className)} {...props} />
}
