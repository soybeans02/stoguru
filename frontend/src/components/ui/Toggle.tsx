interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** aria-label が必要 (見える label がない場合) */
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * iOS 風スイッチ。
 * - off: ライトグレー
 * - on:  オレンジ (light) / オレンジ (dark)
 */
export function Toggle({ checked, onChange, ariaLabel, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-[44px] h-[26px] rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-strong)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  );
}
