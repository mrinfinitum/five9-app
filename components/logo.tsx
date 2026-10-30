import Image from "next/image";

/**
 * The Five9 Media wordmark from five9.media (red "9"). "five" is white in dark
 * mode and near-black in light mode; CSS shows the right one.
 */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const height = size === "lg" ? 64 : 30;
  const width = Math.round((height * 500) / 211);
  return (
    <span className="inline-flex" role="img" aria-label="Five9 Media">
      <Image alt="" className="logo-on-dark block select-none" height={height} priority src="/five9-logo.png" style={{ height, width: "auto" }} width={width} />
      <Image alt="" className="logo-on-light block select-none" height={height} priority src="/five9-logo-dark.png" style={{ height, width: "auto" }} width={width} />
    </span>
  );
}
