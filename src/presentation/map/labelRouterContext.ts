import { createContext, useContext } from 'react'
import type { CreateLabelRouterClient } from '../../domain/labelRouterClient'

export const LabelRouterContext = createContext<CreateLabelRouterClient | null>(null)
export const useLabelRouterFactory = () => useContext(LabelRouterContext)
