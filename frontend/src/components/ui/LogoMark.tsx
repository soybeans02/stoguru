/**
 * LogoMark — stoguru の共通ブランドマーク。
 *
 * Claude Design の sidebar 左上 .stg-brand__mark と完全に同一の SVG（pin shape +
 * 中央のドット）を使い、オレンジグラデーション背景 + soft shadow で囲む。
 *
 * favicon, AuthScreen ロゴ, DiscoveryHome 装飾セクション, その他「以前は
 * /app-icon.png を使っていた箇所」を全てこのコンポーネントに統一する。
 *
 * size は外周コンテナ（角丸正方形）の px。pin SVG は size の 60% 程度。
 */
type LogoMarkProps = {
  size?: number;
  /** rounded radius. defaults to size * 0.3 (角丸 30%) */
  radius?: number;
  /** drop shadow を出すか */
  shadow?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function LogoMark({
  size = 48,
  radius,
  shadow = true,
  className = '',
  ariaLabel = 'stoguru',
}: LogoMarkProps) {
  const r = radius ?? Math.round(size * 0.3);
  const pinSize = Math.round(size * 0.6);

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: r,
        background: 'linear-gradient(180deg, #FE9B3A, #FE8D28)',
        boxShadow: shadow
          ? `0 ${Math.round(size * 0.08)}px ${Math.round(size * 0.22)}px rgba(254,141,40,0.32)`
          : 'none',
        flexShrink: 0,
      }}
    >
      <svg
        width={pinSize}
        height={pinSize}
        viewBox="0 0 24 24"
        fill="white"
        aria-hidden="true"
      >
        {/* pin の外形（teardrop） */}
        <path d="M12 2c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7Z" />
        {/* 中央の白丸（背景の橙が透ける形になる：抜き白） */}
        <circle cx="12" cy="9" r="3" fill="#FE8D28" />
      </svg>
    </span>
  );
}
