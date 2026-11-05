import { useCallback, useState } from 'react'

export type AnalysisToolDialogsHybridPort = {
  tryOpenLetterCodesHybridWindow: () => Promise<boolean>
}

export type AnalysisToolDialogsOpenSnapshot = {
  dnaMwOpen: boolean
  doubleDigestOpen: boolean
  letterCodesOpen: boolean
}

/** Owns DNA MW, double digest, and letter-codes tool dialog open state and hybrid fallback. */
export function useAnalysisToolDialogsController() {
  const [dnaMwOpen, setDnaMwOpen] = useState(false)
  const [doubleDigestOpen, setDoubleDigestOpen] = useState(false)
  const [letterCodesOpen, setLetterCodesOpen] = useState(false)

  const openLetterCodesWindow = useCallback((ports: AnalysisToolDialogsHybridPort) => {
    void ports.tryOpenLetterCodesHybridWindow().then((opened) => {
      if (!opened) setLetterCodesOpen(true)
    })
  }, [])

  const openSnapshot: AnalysisToolDialogsOpenSnapshot = {
    dnaMwOpen,
    doubleDigestOpen,
    letterCodesOpen,
  }

  return {
    openSnapshot,
    dnaMwOpen,
    setDnaMwOpen,
    doubleDigestOpen,
    setDoubleDigestOpen,
    letterCodesOpen,
    setLetterCodesOpen,
    openLetterCodesWindow,
  }
}
