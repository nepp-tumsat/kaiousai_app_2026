export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ''

export type VisitorType = 'student_tokai' | 'student_other' | 'general'
export type JobStage = 'before' | 'active' | 'done'
export type JobField = 'maritime' | 'ocean_fishery' | 'it' | 'public_research' | 'other'
export type Companion = 'alone' | 'friends' | 'family' | 'couple'
export type ReferralSource = 'sns' | 'word_of_mouth' | 'poster' | 'search' | 'other'

export type OnboardingParams = {
  visitor_type: VisitorType
  companion: Companion
  job_stage?: JobStage
  job_field?: JobField
  referral_source?: ReferralSource
}

export function trackOnboardingComplete(params: OnboardingParams) {
  if (typeof window === 'undefined' || !window.gtag || !GA_MEASUREMENT_ID) return
  window.gtag('event', 'onboarding_complete', params)
}

export function trackEvent(name: string, params?: Record<string, string>) {
  if (typeof window === 'undefined' || !window.gtag || !GA_MEASUREMENT_ID) return
  window.gtag('event', name, params)
}

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void
    dataLayer: unknown[]
  }
}
