import { useState, useCallback } from 'react';
import { useTranslation } from '../../context/LanguageContext';

interface OnboardingScreenProps {
  onComplete: (selectedScenes: string[]) => void;
}

const SCENES = [
  { id: 'solo', label: 'ひとり', emoji: '\u{1F9D1}' },
  { id: 'date', label: 'デート', emoji: '\u{1F46B}' },
  { id: 'friends', label: '友達', emoji: '\u{1F465}' },
  { id: 'drinks', label: '飲み', emoji: '\u{1F37B}' },
] as const;

const TOTAL_STEPS = 5;

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      setDirection('next');
      setStep((s) => s + 1);
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection('prev');
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    onComplete([]);
  }, [onComplete]);

  const handleStart = useCallback(() => {
    onComplete(selectedScenes);
  }, [onComplete, selectedScenes]);

  const toggleScene = useCallback((id: string) => {
    setSelectedScenes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }, []);

  const isLast = step === TOTAL_STEPS - 1;

  return (
    <div className="flex flex-col h-svh bg-[var(--bg)] text-[var(--text-primary)] max-w-xl mx-auto overflow-hidden">
      {/* Top row: skip / back */}
      <div className="flex justify-between items-center p-4 h-12">
        {step > 0 ? (
          <button
            onClick={goBack}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            ← {t('common.back')}
          </button>
        ) : <span />}
        {!isLast && (
          <button
            onClick={handleSkip}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {t('common.skip')}
          </button>
        )}
      </div>

      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        <div
          key={step}
          className={`w-full px-8 ${
            direction === 'next' ? 'animate-slide-in-right' : 'animate-slide-in-left'
          }`}
        >
          {step === 0 && (
            <Step
              emoji="🃏"
              title={t('onboarding.swipeTitle')}
              description={t('onboarding.swipeDescription')}
            />
          )}
          {step === 1 && (
            <Step
              emoji="🔖"
              title={t('onboarding.saveTitle')}
              description={t('onboarding.saveDescription')}
            />
          )}
          {step === 2 && (
            <Step
              emoji="🗺️"
              title={t('onboarding.mapTitle')}
              description={t('onboarding.mapDescription')}
            />
          )}
          {step === 3 && (
            <Step
              emoji="✈️"
              title={t('onboarding.destinationTitle')}
              description={t('onboarding.destinationDescription')}
            />
          )}
          {step === 4 && (
            <StepGetStarted
              selectedScenes={selectedScenes}
              onToggleScene={toggleScene}
              title={t('onboarding.doneTitle')}
              description={t('onboarding.doneDescription')}
            />
          )}
        </div>
      </div>

      {/* Dots + Button */}
      <div className="pb-12 pt-4 flex flex-col items-center gap-6">
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step
                  ? 'bg-[var(--accent-orange)] w-6'
                  : 'bg-[var(--border-strong)] w-2'
              }`}
            />
          ))}
        </div>

        {!isLast ? (
          <button
            onClick={goNext}
            className="w-64 py-3 rounded-full bg-[var(--accent-orange)] text-[var(--text-on-accent)] font-medium text-base transition-transform active:scale-95"
          >
            {t('common.next')}
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="w-64 py-3 rounded-full bg-[var(--accent-orange)] text-[var(--text-on-accent)] font-medium text-base transition-transform active:scale-95"
          >
            {t('onboarding.start')}
          </button>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(60px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-60px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out;
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

function Step({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <span className="text-7xl" role="img" aria-label={title}>{emoji}</span>
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-4">{title}</h1>
      <p className="text-base text-[var(--text-secondary)] leading-relaxed max-w-xs">
        {description}
      </p>
    </div>
  );
}

function StepGetStarted({
  selectedScenes,
  onToggleScene,
  title,
  description,
}: {
  selectedScenes: string[];
  onToggleScene: (id: string) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
      <p className="text-base text-[var(--text-secondary)] leading-relaxed">
        {description}
      </p>
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {SCENES.map((scene) => {
          const selected = selectedScenes.includes(scene.id);
          return (
            <button
              key={scene.id}
              onClick={() => onToggleScene(scene.id)}
              className={`px-5 py-2.5 rounded-full text-base font-medium transition-all duration-200 border-2 ${
                selected
                  ? 'bg-[var(--accent-orange)] text-[var(--text-on-accent)] border-[var(--accent-orange)]'
                  : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:border-[var(--accent-orange)]'
              }`}
            >
              {scene.emoji} {scene.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
