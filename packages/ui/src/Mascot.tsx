import { cva } from "class-variance-authority";
import bit from "./mascots/bit.svg";
import booky from "./mascots/booky.svg";
import echo from "./mascots/echo.svg";
import hush from "./mascots/hush.svg";
import pip from "./mascots/pip.svg";

// Each mascot is an animated SVG that loops on its own, and holds still when the Learner prefers reduced motion.
const sources = { pip, hush, echo, booky, bit };
const image = cva("h-auto select-none", {
  variants: { size: { sm: "w-16", md: "w-28", lg: "w-40", xl: "w-64 sm:w-80" } },
  defaultVariants: { size: "md" },
});

export type MascotName = keyof typeof sources;

export type MascotProps = {
  name: MascotName;
  size?: "sm" | "md" | "lg" | "xl";
};

/** A Get Fluency mascot. It's decoration, so screen readers skip it. */
export function Mascot({ name, size }: MascotProps) {
  return <img src={sources[name]} alt="" aria-hidden className={image({ size })} />;
}
