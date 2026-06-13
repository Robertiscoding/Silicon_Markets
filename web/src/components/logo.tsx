import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function Logo({ size = 36, className, glow = true }: LogoProps) {
  return (
    <Image
      src="/logosm.png"
      alt="Silicon Markets"
      width={size}
      height={size}
      priority
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        filter: glow ? "drop-shadow(0 0 8px rgba(60, 224, 107, 0.55))" : undefined,
      }}
    />
  );
}
