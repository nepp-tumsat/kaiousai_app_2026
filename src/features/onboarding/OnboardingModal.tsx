'use client'

import { useState, useEffect } from 'react'
import './OnboardingModal.css'
import {
  trackOnboardingComplete,
  type VisitorType,
  type JobStage,
  type JobField,
  type Companion,
  type ReferralSource,
} from '@/lib/gtag'

const STORAGE_KEY = 'onboarding_done'

type Step = 'visitor_type' | 'job_stage' | 'job_field' | 'referral' | 'companion'

function stepOrder(visitorType: VisitorType | null): Step[] {
  if (visitorType === 'student_tokai') return ['visitor_type', 'job_stage', 'job_field', 'companion']
  if (visitorType === 'general') return ['visitor_type', 'referral', 'companion']
  return ['visitor_type', 'companion']
}

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<Step>('visitor_type')
  const [visitorType, setVisitorType] = useState<VisitorType | null>(null)
  const [jobStage, setJobStage] = useState<JobStage | null>(null)
  const [jobField, setJobField] = useState<JobField | null>(null)
  const [companion, setCompanion] = useState<Companion | null>(null)
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  if (!visible) return null

  const steps = stepOrder(visitorType)
  const currentIndex = steps.indexOf(step)
  const totalSteps = steps.length

  function advance() {
    const next = steps[currentIndex + 1]
    if (next) {
      setStep(next)
    } else {
      complete()
    }
  }

  function complete() {
    if (!visitorType || !companion) return
    trackOnboardingComplete({
      visitor_type: visitorType,
      companion,
      ...(jobStage ? { job_stage: jobStage } : {}),
      ...(jobField ? { job_field: jobField } : {}),
      ...(referralSource ? { referral_source: referralSource } : {}),
    })
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  function skip() {
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
          <VisitorTypeStep
            onSelect={(v) => {
              setVisitorType(v)
              // steps変更前にすぐ次へ進むためstepOrderを直接計算
              const next = stepOrder(v)[1]
              if (next) setStep(next)
            }}
          />
        )}

        {step === 'job_stage' && (
          <SingleChoiceStep<JobStage>
            question="就活の状況を教えてください"
            choices={[
              { value: 'before', label: 'まだ先の話' },
              { value: 'active', label: '現在就活中' },
              { value: 'done', label: '内定・進路決定済み' },
            ]}
            selected={jobStage}
            onSelect={setJobStage}
            onNext={advance}
          />
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
            onNext={advance}
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
            onNext={advance}
          />
        )}

        {step === 'companion' && (
          <SingleChoiceStep<Companion>
            question="今日は誰と来ましたか？"
            choices={[
              { value: 'alone', label: '一人で' },
              { value: 'friends', label: '友人と' },
              { value: 'family', label: '家族と' },
              { value: 'couple', label: 'カップルで' },
            ]}
            selected={companion}
            onSelect={setCompanion}
            onNext={advance}
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

function VisitorTypeStep({ onSelect }: { onSelect: (v: VisitorType) => void }) {
  return (
    <>
      <p className="onboarding-question">ようこそ！あなたはどちらですか？</p>
      <div className="onboarding-choices">
        {([
          { value: 'student_tokai' as VisitorType, label: '東京海洋大学の在学生' },
          { value: 'student_other' as VisitorType, label: '他大学・専門学生' },
          { value: 'general' as VisitorType, label: '一般来場者' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            className="onboarding-choice"
            onClick={() => onSelect(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}

function SingleChoiceStep<T extends string>({
  question,
  choices,
  selected,
  onSelect,
  onNext,
}: {
  question: string
  choices: { value: T; label: string }[]
  selected: T | null
  onSelect: (v: T) => void
  onNext: () => void
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
        <button
          className="onboarding-next-btn"
          disabled={selected === null}
          onClick={onNext}
        >
          次へ
        </button>
      </div>
    </>
  )
}
