"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Liquid-glass primitives, after Aave's "Building Glass for the Web":
 * a displacement map (red = horizontal bend, green = vertical bend) is
 * generated on a canvas from the lens geometry, then fed to an SVG
 * feDisplacementMap that refracts the element's own rendered pixels.
 * Content stays live DOM — selectable, clickable — only its pixels bend.
 */

// Fresh ID per map update — Safari caches filter output by ID and will
// otherwise keep serving stale results when the map changes.
let filterCounter = 0;

interface LensGeometry {
  radius: number;
  /** How far (px) the curved rim reaches into the lens before it flattens. */
  depth: number;
  /** Exponent shaping the rim falloff; higher = tighter bend at the edge. */
  curve: number;
}

function roundedRectSDF(px: number, py: number, w: number, h: number, r: number): number {
  const qx = Math.abs(px) - (w / 2 - r);
  const qy = Math.abs(py) - (h / 2 - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Builds the displacement map as a data URL. Pixels in the flat center stay
 * neutral (128,128); pixels near the rim get an inward-pointing offset whose
 * magnitude follows the curvature profile, which reads as magnification
 * through a convex lens. Sampling inward also means the filter never pulls
 * in transparent pixels from outside the clip.
 */
function generateLensMap(w: number, h: number, { radius, depth, curve }: LensGeometry): string {
  const cw = Math.max(2, Math.round(w));
  const ch = Math.max(2, Math.round(h));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(cw, ch);
  const r = Math.min(radius, cw / 2, ch / 2);
  const eps = 1;

  for (let yI = 0; yI < ch; yI++) {
    for (let xI = 0; xI < cw; xI++) {
      const px = xI + 0.5 - cw / 2;
      const py = yI + 0.5 - ch / 2;
      const d = roundedRectSDF(px, py, cw, ch, r);
      let dx = 0;
      let dy = 0;
      if (d < 0) {
        const t = Math.min(1, Math.max(0, 1 + d / depth));
        if (t > 0) {
          const mag = Math.pow(t, curve);
          const gx =
            roundedRectSDF(px + eps, py, cw, ch, r) - roundedRectSDF(px - eps, py, cw, ch, r);
          const gy =
            roundedRectSDF(px, py + eps, cw, ch, r) - roundedRectSDF(px, py - eps, cw, ch, r);
          const len = Math.hypot(gx, gy) || 1;
          dx = -(gx / len) * mag;
          dy = -(gy / len) * mag;
        }
      }
      const i = (yI * cw + xI) * 4;
      img.data[i] = Math.round(128 + dx * 127);
      img.data[i + 1] = Math.round(128 + dy * 127);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

export interface GlassLensProps {
  width: number;
  height: number;
  radius?: number;
  /** Rim reach in px before the lens flattens. */
  depth?: number;
  /** feDisplacementMap scale — max bend is roughly half this, in px. */
  strength?: number;
  /** Rim falloff exponent. */
  curve?: number;
  /** 0 disables the chromatic fringe; ~0.1 gives a subtle color split. */
  chroma?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * A glass lens that refracts whatever you render inside it. The children are
 * clipped to the lens shape, displaced by the generated map, and finished
 * with a specular rim. Give it content that extends to (or past) the lens
 * bounds — that's what the rim will bend.
 */
export function GlassLens({
  width,
  height,
  radius = 14,
  depth = 12,
  strength = 36,
  curve = 1.6,
  chroma = 0.12,
  className,
  style,
  children,
}: GlassLensProps) {
  const [filter, setFilter] = useState<{ id: string; url: string } | null>(null);

  // Clamp the bend to the lens size: max sampling offset is ~strength/2, and
  // letting it reach past a third of the lens duplicates content (text ghosts
  // above/below short pills) instead of bending it.
  const safeStrength = Math.min(strength, height * 0.65, width * 0.65);
  const safeDepth = Math.min(depth, height / 3.5, width / 3.5);

  useEffect(() => {
    if (width < 2 || height < 2) return;
    const url = generateLensMap(width, height, { radius, depth: safeDepth, curve });
    if (url) setFilter({ id: `glass-lens-${++filterCounter}`, url });
  }, [width, height, radius, safeDepth, curve]);

  const keepR = "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0";
  const keepG = "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0";
  const keepB = "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0";

  return (
    <div
      className={className}
      style={{ position: "relative", width, height, borderRadius: radius, ...style }}
    >
      {filter && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
          <defs>
            <filter
              id={filter.id}
              x="0"
              y="0"
              width={width}
              height={height}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feImage href={filter.url} x="0" y="0" width={width} height={height} result="map" />
              {chroma > 0 ? (
                <>
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={safeStrength * (1 + chroma)}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="dispR"
                  />
                  <feColorMatrix in="dispR" type="matrix" values={keepR} result="chR" />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={safeStrength}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="dispG"
                  />
                  <feColorMatrix in="dispG" type="matrix" values={keepG} result="chG" />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={safeStrength * (1 - chroma)}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="dispB"
                  />
                  <feColorMatrix in="dispB" type="matrix" values={keepB} result="chB" />
                  <feComposite in="chR" in2="chG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="chRG" />
                  <feComposite in="chRG" in2="chB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
                </>
              ) : (
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={safeStrength}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              )}
            </filter>
          </defs>
        </svg>
      )}

      {/* refracted content — the outer div re-clips the FILTERED result to the
          rounded shape (an element's own border-radius doesn't clip its filter
          output, so displaced pixels would otherwise escape the corners). */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            filter: filter ? `url(#${filter.id})` : undefined,
          }}
        >
          {children}
        </div>
      </div>

      {/* specular rim + sheen */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          pointerEvents: "none",
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 1px rgba(255,255,255,0.12), inset 1.5px 0 1px -1px rgba(255,255,255,0.2), inset -1.5px 0 1px -1px rgba(255,255,255,0.2)",
          background:
            "linear-gradient(155deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 28%, rgba(255,255,255,0) 45%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.07) 100%)",
        }}
      />
    </div>
  );
}

export interface GlassToggleOption<T extends string | number> {
  value: T;
  label: string;
}

interface GlassToggleProps<T extends string | number> {
  options: GlassToggleOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  className?: string;
  /** Equal-width options filling the container (grid-like). */
  stretch?: boolean;
  /** Extra classes for each option button (sizing/typography). */
  optionClassName?: string;
}

/**
 * Segmented control where the selection indicator is a glass lens gliding
 * over the options (Aave's toggle-group recipe). The lens refracts a
 * highlighted accent-pill copy of the row, counter-translated so it stays
 * registered with the real buttons while the lens sweeps across them.
 */
export function GlassToggle<T extends string | number>({
  options,
  value,
  onChange,
  className,
  stretch = false,
  optionClassName = "text-[11px] px-3 py-1",
}: GlassToggleProps<T>) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef(new Map<number, HTMLButtonElement>());
  const activeIndex = options.findIndex((o) => o.value === value);
  const [rect, setRect] = useState<
    { left: number; width: number; height: number; rowWidth: number } | null
  >(null);

  // Track the active button's box; re-measure on resize and option changes.
  // No active option (e.g. a custom value from a slider) hides the lens.
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      if (!row) return;
      if (activeIndex < 0) {
        setRect(null);
        return;
      }
      const btn = btnRefs.current.get(activeIndex);
      if (!btn) return;
      setRect({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
        height: btn.offsetHeight,
        rowWidth: row.clientWidth,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (rowRef.current) ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, [activeIndex, options]);

  // The springy glide both the lens and the counter-copy share, so the copy
  // stays glued to the row underneath while the lens window moves. Transform
  // only — the displacement map is generated per lens size, so width snaps.
  const glide = "transform 420ms cubic-bezier(0.3, 1.25, 0.45, 1)";

  const pillRow = useMemo(
    () => (
      <div
        className="flex items-center gap-1.5"
        style={{ height: "100%", width: stretch && rect ? rect.rowWidth : undefined }}
      >
        {options.map((o, i) => (
          <span
            key={`${i}-${String(o.value)}`}
            className={`${optionClassName} rounded-md font-mono-thin inline-flex items-center justify-center whitespace-nowrap ${stretch ? "flex-1" : ""}`}
            style={{
              background: "linear-gradient(180deg, #4ef07d 0%, #2cc658 100%)",
              color: "#04130a",
              fontWeight: 600,
            }}
          >
            {o.label}
          </span>
        ))}
      </div>
    ),
    [options, stretch, rect, optionClassName],
  );

  return (
    <div ref={rowRef} className={`relative flex items-center gap-1.5 ${className ?? ""}`}>
      {options.map((o, i) => (
        <button
          key={`${i}-${String(o.value)}`}
          ref={(el) => {
            if (el) btnRefs.current.set(i, el);
            else btnRefs.current.delete(i);
          }}
          type="button"
          onClick={() => onChange?.(o.value)}
          className={`${optionClassName} rounded-md font-mono-thin transition-colors whitespace-nowrap text-muted-strong hover:text-foreground ${stretch ? "flex-1" : ""}`}
        >
          {o.label}
        </button>
      ))}

      {rect && (
        <div
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            transform: `translateX(${rect.left}px)`,
            width: rect.width,
            height: rect.height,
            transition: glide,
          }}
        >
          {/* Gentle bend — the label has to stay readable through the glass. */}
          <GlassLens width={rect.width} height={rect.height} radius={8} depth={7} strength={14} chroma={0.07}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: rect.height,
                transform: `translateX(${-rect.left}px)`,
                transition: glide,
              }}
            >
              {pillRow}
            </div>
          </GlassLens>
        </div>
      )}
    </div>
  );
}
