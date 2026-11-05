import type { RefObject } from 'react'

type WorkspaceFileInputBaseProps = {
  inputRef: RefObject<HTMLInputElement | null>
  accept?: string
}

export type WorkspaceFileInputProps = WorkspaceFileInputBaseProps & (
  | {
      multiple: true
      onFiles: (files: File[]) => void
    }
  | {
      multiple?: false
      onFile: (file: File) => void
    }
)

/**
 * Hidden file-input host. Owns only the rendering and the generic
 * "collect selection, reset the input value, invoke the routing callback"
 * sequence; App/controller callbacks remain the authority for routing each
 * selected file.
 */
export function WorkspaceFileInput(props: WorkspaceFileInputProps) {
  const { inputRef, accept } = props
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      {...(props.multiple ? { multiple: true } : {})}
      hidden
      onChange={(event) => {
        const files = event.target.files ? Array.from(event.target.files) : []
        event.currentTarget.value = ''
        if (!files.length) return
        if (props.multiple) props.onFiles(files)
        else props.onFile(files[0]!)
      }}
    />
  )
}
