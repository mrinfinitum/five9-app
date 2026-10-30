import Image from "next/image";

/** The Five9 Media wordmark (white "five9", from five9.media). */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const height = size === "lg" ? 64 : 30;
  return (
    <Image
      alt="Five9 Media"
      className="block select-none"
      height={height}
      priority
      src="/five9-logo.png"
      style={{ height, width: "auto" }}
      width={Math.round((height * 500) / 211)}
    />
  );
}
