import { useState, useCallback } from 'react';

interface OnboardingScreenProps {
  onComplete: (selectedScenes: string[]) => void;
}

const SCENES = [
  { id: 'solo', label: 'ひとり', emoji: '\u{1F9D1}' },
  { id: 'date', label: 'デート', emoji: '\u{1F46B}' },
  { id: 'friends', label: '友達', emoji: '\u{1F465}' },
  { id: 'drinks', label: '飲み', emoji: '\u{1F37B}' },
] as const;

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState(0);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const goNext = useCallback(() => {
    if (step < 2) {
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

  return (
    <div className="flex flex-col h-svh bg-white max-w-xl mx-auto overflow-hidden">
      {/* Skip link */}
      {step < 2 && (
        <div className="flex justify-end p-4">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            スキップ
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="flex justify-start p-4">
          <button
            onClick={goBack}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← 戻る
          </button>
        </div>
      )}

      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        <div
          key={step}
          className={`w-full px-8 ${
            direction === 'next'
              ? 'animate-slide-in-right'
              : 'animate-slide-in-left'
          }`}
        >
          {step === 0 && <StepWelcome />}
          {step === 1 && <StepHowItWorks />}
          {step === 2 && (
            <StepGetStarted
              selectedScenes={selectedScenes}
              onToggleScene={toggleScene}
            />
          )}
        </div>
      </div>

      {/* Dots + Button */}
      <div className="pb-12 pt-4 flex flex-col items-center gap-6">
        {/* Dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === step ? 'bg-gray-900 w-6' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Action button */}
        {step < 2 ? (
          <button
            onClick={goNext}
            className="w-64 py-3 rounded-full bg-orange-500 text-white font-medium text-base transition-transform active:scale-95"
          >
            次へ
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="w-64 py-3 rounded-full bg-orange-500 text-white font-medium text-base transition-transform active:scale-95"
          >
            始める
          </button>
        )}
      </div>

      {/* Inline keyframe styles */}
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

function StepWelcome() {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <span className="text-7xl" role="img" aria-label="restaurant">
        🍽️
      </span>
      <h1 className="text-2xl font-bold text-gray-900 mt-4">
        ストグルへようこそ
      </h1>
      <p className="text-base text-gray-500 leading-relaxed">
        インフルエンサーが紹介したお店を
        <br />
        スワイプで保存しよう
      </p>
    </div>
  );
}

function StepHowItWorks() {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      <h1 className="text-2xl font-bold text-gray-900">使い方</h1>
      <div className="flex flex-col gap-5 w-full max-w-xs">
        {/* Right swipe */}
        <div className="flex items-center gap-4 bg-green-50 rounded-2xl px-5 py-4">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900">
              右スワイプ →
            </p>
            <p className="text-sm text-gray-500">保存</p>
          </div>
        </div>
        {/* Left swipe */}
        <div className="flex items-center gap-4 bg-red-50 rounded-2xl px-5 py-4">
          <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900">
              左スワイプ ←
            </p>
            <p className="text-sm text-gray-500">スキップ</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepGetStarted({
  selectedScenes,
  onToggleScene,
}: {
  selectedScenes: string[];
  onToggleScene: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <h1 className="text-2xl font-bold text-gray-900">さっそく始めよう</h1>
      <p className="text-base text-gray-500 leading-relaxed">
        気になるシーンを選んでね
        <br />
        <span className="text-sm">（あとで変更できるよ）</span>
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
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
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
