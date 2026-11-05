import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function ThemeDialog({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('vg-dialog', className)} {...props} />
}

export function ThemeCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('vg-card', className)} {...props} />
}

export function ThemePanel({
  className,
  variant = 'panel',
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: 'panel' | 'muted' | 'raised' }) {
  return <div className={classes(`vg-panel${variant === 'panel' ? '' : `--${variant}`}`, className)} {...props} />
}

export function ThemeButton({
  className,
  selected = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      {...props}
      className={classes('vg-button', className)}
      data-vg-state={selected ? 'selected' : undefined}
    />
  )
}

export function ThemeInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes('vg-field', className)} {...props} />
}

export function ThemeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classes('vg-field', className)} {...props} />
}

export function ThemeTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classes('vg-field', className)} {...props} />
}

export function ThemeChip({
  children,
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: 'warning' | 'danger' | 'success'
}) {
  return (
    <span className={classes('vg-chip', className)} data-vg-tone={tone} {...props}>
      {children}
    </span>
  )
}

export function ThemeNotice({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone: 'warning' | 'danger' | 'success' }) {
  return <div className={classes(`vg-notice--${tone}`, className)} {...props} />
}
