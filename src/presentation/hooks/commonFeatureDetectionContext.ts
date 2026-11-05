import { createContext, useContext } from 'react'
import { detectCommonFeaturesAsync } from '../../domain/commonFeatureDetectionAsync'

export const CommonFeatureDetectionContext = createContext(detectCommonFeaturesAsync)
export const useCommonFeatureDetection = () => useContext(CommonFeatureDetectionContext)
