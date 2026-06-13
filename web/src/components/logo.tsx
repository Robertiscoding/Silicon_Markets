interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function Logo({ size = 36, className, glow = true }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logosm.png"
      alt="Silicon Markets"
      width={size}
      height={size}
      decoding="async"
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        mixBlendMode: "screen",
        filter: glow ? "drop-shadow(0 0 8px rgba(60, 224, 107, 0.55))" : undefined,
      }}
    />
  );
}
