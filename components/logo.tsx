export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label="Five9 Media">
      <span
        className={`grid place-items-center rounded-md bg-brand font-black text-white ${big ? "h-12 w-12 text-3xl" : "h-8 w-8 text-lg"}`}
        aria-hidden="true"
      >
        9
      </span>
      <span className="flex flex-col leading-none" aria-hidden="true">
        <span className={`font-black tracking-tight text-white ${big ? "text-3xl" : "text-lg"}`}>
          FIVE<span className="text-brand">9</span>
        </span>
        <span className={`font-semibold tracking-[0.35em] text-muted ${big ? "text-xs" : "text-[0.6rem]"}`}>MEDIA</span>
      </span>
    </span>
  );
}
