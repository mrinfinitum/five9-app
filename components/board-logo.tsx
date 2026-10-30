import Image from "next/image";
import type { Board } from "@/lib/requests/types";

const SIZES = { sm: 36, md: 56, lg: 80 } as const;

/** A board's logo on a dark or light tile (chosen per board), or nothing if it has none. */
export function BoardLogo({
  board,
  size = "md",
}: {
  board: Pick<Board, "name" | "logoUrl" | "logoBackground">;
  size?: keyof typeof SIZES;
}) {
  if (!board.logoUrl) return null;
  const height = SIZES[size];
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ${
        board.logoBackground === "light" ? "bg-white ring-neutral-300" : "bg-ink ring-line"
      }`}
      style={{ height, padding: Math.round(height / 7) }}
    >
      <Image
        alt={`${board.name} logo`}
        className="h-full w-auto max-w-full object-contain"
        height={height}
        src={board.logoUrl}
        width={height * 3}
      />
    </span>
  );
}
