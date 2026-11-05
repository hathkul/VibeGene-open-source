import type { InputHTMLAttributes } from 'react'
import { handleProductNameDoubleClick } from './productNameInputUtils'

export function ProductNameInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { onDoubleClick, ...rest } = props
  return (
    <input
      {...rest}
      onDoubleClick={(event) => {
        handleProductNameDoubleClick(event)
        onDoubleClick?.(event)
      }}
    />
  )
}
