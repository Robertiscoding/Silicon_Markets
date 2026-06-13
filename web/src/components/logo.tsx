interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function Logo({ size = 36, className, glow = true }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
      style={{
        filter: glow ? "drop-shadow(0 0 8px rgba(60, 224, 107, 0.55))" : undefined,
      }}
    >
      <rect width="32" height="32" rx="8" fill="#3ce06b" />
      <path
        d="M10 22V10h6.2c3.4 0 5.6 1.8 5.6 4.7 0 2.2-1.2 3.7-3.1 4.2l4.3 3.1H18l-3.8-2.8H13.2V22H10zm3.2-6.4h2.8c1.5 0 2.4-.7 2.4-1.8s-.9-1.8-2.4-1.8H13.2v3.6z"
        fill="#04130a"
      />
    </svg>
  );
}
