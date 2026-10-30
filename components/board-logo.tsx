import Image from "next/image";
import type { Board } from "@/lib/requests/types";

const SIZES = { sm: 36, md: 56, lg: 80 } as const;

type LogoBoard = Pick<Board, "name" | "logoDarkUrl" | "logoLightUrl" | "logoDarkTint" | "logoLightTint">;

export const hasBoardLogo = (board: Pick<Board, "logoDarkUrl" | "logoLightUrl">) => Boolean(board.logoDarkUrl || board.logoLightUrl);

/**
 * One logo image. With a tint, the image's shape is painted in that single
 * colour (via a CSS mask), so one SVG or transparent PNG can be white in dark
 * mode and black in light mode.
 */
export function LogoImage({
  src,
  alt,
  height,
  tint,
  className = "",
}: {
  src: string;
  alt: string;
  height: number;
  tint: string | null;
  className?: string;
}) {
  const isSvg = /\.svg(\?|$)/i.test(src);
  const image = (
    <Image
      alt={tint ? "" : alt}
      aria-hidden={tint ? true : undefined}
      className={`w-auto max-w-full object-contain ${tint ? "invisible" : ""} ${tint ? "" : className}`}
      height={height}
      src={src}
      style={{ height }}
      unoptimized={isSvg}
      width={height * 4}
    />
  );
  if (!tint) return image;
  return (
    <span aria-label={alt} className={`relative inline-flex max-w-full ${className}`} role="img">
      {image}
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
    </span>
  );
}

/**
 * A board's logo: the dark-mode version in dark mode and the light-mode version
 * in light mode, each in its chosen colour. With only one uploaded, that file is
 * used in both modes.
 */
export function BoardLogo({ board, size = "md" }: { board: LogoBoard; size?: keyof typeof SIZES }) {
  const dark = board.logoDarkUrl ?? board.logoLightUrl;
  const light = board.logoLightUrl ?? board.logoDarkUrl;
  if (!dark || !light) return null;
  const height = SIZES[size];
  const alt = `${board.name} logo`;
  const same = dark === light && board.logoDarkTint === board.logoLightTint;
  return (
    <span className="inline-flex max-w-full shrink-0 items-center" style={{ height }}>
      {same ? (
        <LogoImage alt={alt} height={height} src={dark} tint={board.logoDarkTint} />
      ) : (
        <>
          <LogoImage alt={alt} className="logo-on-dark" height={height} src={dark} tint={board.logoDarkTint} />
          <LogoImage alt={alt} className="logo-on-light" height={height} src={light} tint={board.logoLightTint} />
        </>
      )}
    </span>
  );
}
