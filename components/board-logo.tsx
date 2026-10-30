"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import type { Board } from "@/lib/requests/types";

/**
 * Logo sizes. Wide wordmarks would tower over square crests at the same
 * height, and look tiny at the same area, so height eases down gently as a
 * logo gets wider: height = maxHeight × (refAspect / aspect)^0.4, capped at
 * maxHeight and maxWidth. Square-ish logos use the full height.
 */
const SIZES = {
  sm: { maxHeight: 36, maxWidth: 170, refAspect: 2.2 },
  md: { maxHeight: 56, maxWidth: 280, refAspect: 2.2 },
  lg: { maxHeight: 76, maxWidth: 340, refAspect: 2.2 },
} as const;

type Fit = (typeof SIZES)[keyof typeof SIZES];

type LogoBoard = Pick<Board, "name" | "logoDarkUrl" | "logoLightUrl" | "logoDarkTint" | "logoLightTint">;

function fitSize(aspect: number, fit: Fit) {
  let height = fit.maxHeight * Math.min(1, Math.pow(fit.refAspect / aspect, 0.4));
  if (height * aspect > fit.maxWidth) height = fit.maxWidth / aspect;
  return { width: Math.round(height * aspect), height: Math.round(height) };
}

/**
 * One logo image. With a tint, the image's shape is painted in that single
 * colour (via a CSS mask), so one SVG or transparent PNG can be white in dark
 * mode and black in light mode. Pass `height` for a fixed height, or `fit` to
 * size it by area once the image's proportions are known.
 */
export function LogoImage({
  src,
  alt,
  height,
  fit,
  tint,
  className = "",
}: {
  src: string;
  alt: string;
  height?: number;
  fit?: Fit;
  tint: string | null;
  className?: string;
}) {
  const isSvg = /\.svg(\?|$)/i.test(src);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const measure = useCallback(
    (img: HTMLImageElement | null) => {
      if (!fit || !img || !img.complete || !img.naturalWidth || !img.naturalHeight) return;
      setSize(fitSize(img.naturalWidth / img.naturalHeight, fit));
    },
    [fit],
  );

  const baseHeight = height ?? fit?.maxHeight ?? 40;
  // Until the proportions are known (fit mode), keep the image invisible so nothing jumps.
  const style = size ? { height: size.height, width: size.width } : { height: baseHeight, width: "auto" as const };
  const hidden = fit && !size;

  const image = (
    <Image
      alt={tint ? "" : alt}
      aria-hidden={tint ? true : undefined}
      className={`max-w-full object-contain ${tint || hidden ? "invisible" : ""} ${tint ? "" : className}`}
      height={baseHeight}
      onLoad={(e) => measure(e.currentTarget)}
      ref={measure}
      src={src}
      style={style}
      unoptimized={isSvg}
      width={baseHeight * 4}
    />
  );
  if (!tint) return image;
  return (
    <span aria-label={alt} className={`relative inline-flex max-w-full ${className}`} role="img">
      {image}
      {!hidden ? (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundColor: tint,
            maskImage: `url("${src}")`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskImage: `url("${src}")`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
          }}
        />
      ) : null}
    </span>
  );
}

/**
 * A board's logo: the dark-mode version in dark mode and the light-mode version
 * in light mode, each in its chosen colour. With only one uploaded, that file is
 * used in both modes. Sits in a fixed-height row so cards line up.
 */
export function BoardLogo({ board, size = "md" }: { board: LogoBoard; size?: keyof typeof SIZES }) {
  const dark = board.logoDarkUrl ?? board.logoLightUrl;
  const light = board.logoLightUrl ?? board.logoDarkUrl;
  if (!dark || !light) return null;
  const fit = SIZES[size];
  const alt = `${board.name} logo`;
  const same = dark === light && board.logoDarkTint === board.logoLightTint;
  return (
    <span className="inline-flex max-w-full shrink-0 items-center" style={{ height: fit.maxHeight }}>
      {same ? (
        <LogoImage alt={alt} fit={fit} src={dark} tint={board.logoDarkTint} />
      ) : (
        <>
          <LogoImage alt={alt} className="logo-on-dark" fit={fit} src={dark} tint={board.logoDarkTint} />
          <LogoImage alt={alt} className="logo-on-light" fit={fit} src={light} tint={board.logoLightTint} />
        </>
      )}
    </span>
  );
}
