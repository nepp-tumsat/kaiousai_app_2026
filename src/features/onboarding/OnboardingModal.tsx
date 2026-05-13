'use client'

import { useState, useEffect } from 'react'
import './OnboardingModal.css'
import {
  trackOnboardingComplete,
  trackEvent,
  type VisitorType,
  type JobField,
  type ReferralSource,
} from '@/lib/gtag'

const STORAGE_KEY = 'onboarding_done'

type Step = 'visitor_type' | 'job_field' | 'referral'

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<Step>('visitor_type')
  const [visitorType, setVisitorType] = useState<VisitorType | null>(null)
  const [jobField, setJobField] = useState<JobField | null>(null)
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  if (!visible) return null

  const totalSteps = 2
  const currentIndex = step === 'visitor_type' ? 0 : 1

  function selectVisitorType(v: VisitorType) {
    setVisitorType(v)
    setStep(v === 'student_tokai' ? 'job_field' : 'referral')
  }

  function complete(field: JobField | null, referral: ReferralSource | null) {
    if (!visitorType) return
    trackOnboardingComplete({
      visitor_type: visitorType,
      ...(field ? { job_field: field } : {}),
      ...(referral ? { referral_source: referral } : {}),
    })
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  function skip() {
    trackEvent('onboarding_skip', { step })
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal" role="dialog" aria-modal="true">
        <div className="onboarding-progress">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={
                'onboarding-progress-dot' +
                (i < currentIndex ? ' onboarding-progress-dot--done' : '') +
                (i === currentIndex ? ' onboarding-progress-dot--active' : '')
              }
            />
          ))}
        </div>

        {step === 'visitor_type' && (
          <>
            <p className="onboarding-question">ようこそ！あなたはどちらですか？</p>
            <div className="onboarding-choices">
              <button className="onboarding-choice" onClick={() => selectVisitorType('student_tokai')}>
                東京海洋大学の在学生
              </button>
              <button className="onboarding-choice" onClick={() => selectVisitorType('general')}>
                一般来場者（他大学生含む）
              </button>
            </div>
          </>
        )}

        {step === 'job_field' && (
          <SingleChoiceStep<JobField>
            question="志望する分野を教えてください"
            choices={[
              { value: 'maritime', label: '商船・海技系' },
              { value: 'ocean_fishery', label: '海洋・水産・環境系' },
              { value: 'it', label: 'IT・情報・エンジニア系' },
              { value: 'public_research', label: '公務員・研究職' },
              { value: 'other', label: 'その他・未定' },
            ]}
            selected={jobField}
            onSelect={setJobField}
            onNext={() => complete(jobField, null)}
            onBack={() => { setVisitorType(null); setJobField(null); setStep('visitor_type') }}
          />
        )}

        {step === 'referral' && (
          <SingleChoiceStep<ReferralSource>
            question="海王祭をどこで知りましたか？"
            choices={[
              { value: 'sns', label: 'SNS（X / Instagram など）' },
              { value: 'word_of_mouth', label: '知人・友人の紹介' },
              { value: 'poster', label: 'ポスター・チラシ' },
              { value: 'search', label: 'Web検索' },
              { value: 'other', label: 'その他' },
            ]}
            selected={referralSource}
            onSelect={setReferralSource}
            onNext={() => complete(null, referralSource)}
            onBack={() => { setVisitorType(null); setReferralSource(null); setStep('visitor_type') }}
          />
        )}

        <div className="onboarding-skip">
          <button className="onboarding-skip-btn" onClick={skip}>
            スキップ
          </button>
        </div>
      </div>
    </div>
  )
}

function SingleChoiceStep<T extends string>({
  question,
  choices,
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  question: string
  choices: { value: T; label: string }[]
  selected: T | null
  onSelect: (v: T) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <>
      <p className="onboarding-question">{question}</p>
      <div className="onboarding-choices">
        {choices.map(({ value, label }) => (
          <button
            key={value}
            className={
              'onboarding-choice' +
              (selected === value ? ' onboarding-choice--selected' : '')
            }
            onClick={() => onSelect(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="onboarding-footer">
        <button className="onboarding-back-btn" onClick={onBack}>
          ← 戻る
        </button>
        <button
          className="onboarding-next-btn"
          disabled={selected === null}
          onClick={onNext}
        >
          完了
        </button>
      </div>
    </>
  )
}
