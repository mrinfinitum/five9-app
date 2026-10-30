import Image from "next/image";
import type { Board } from "@/lib/requests/types";

const SIZES = { sm: 36, md: 56, lg: 80 } as const;

export const hasBoardLogo = (board: Pick<Board, "logoDarkUrl" | "logoLightUrl">) => Boolean(board.logoDarkUrl || board.logoLightUrl);

/**
 * A board's logo: the dark-mode version in dark mode and the light-mode version
 * in light mode. With only one uploaded, that one is used in both.
 */
export function BoardLogo({
  board,
  size = "md",
}: {
  board: Pick<Board, "name" | "logoDarkUrl" | "logoLightUrl">;
  size?: keyof typeof SIZES;
}) {
  const dark = board.logoDarkUrl ?? board.logoLightUrl;
  const light = board.logoLightUrl ?? board.logoDarkUrl;
  if (!dark || !light) return null;
  const height = SIZES[size];
  const image = (src: string, className = "") => (
    <Image
      alt={`${board.name} logo`}
      className={`w-auto max-w-full object-contain ${className}`}
      height={height}
      key={className || "single"}
      src={src}
      style={{ height }}
      width={height * 4}
    />
  );
  return (
    <span className="inline-flex max-w-full shrink-0 items-center" style={{ height }}>
      {dark === light ? image(dark) : [image(dark, "logo-on-dark"), image(light, "logo-on-light")]}
    </span>
  );
}
