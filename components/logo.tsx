import Image from "next/image";

/** The Five9 Media wordmark from five9.media: white "five", red "9". */
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
