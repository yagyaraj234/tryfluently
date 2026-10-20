import { cva } from "class-variance-authority";
import { textSizeClasses, type TextSize } from "./Text";

type SpaceStep = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 14;

const heights: Record<SpaceStep, string> = {
  1: "h-1",
  2: "h-2",
  3: "h-3",
  4: "h-4",
  5: "h-5",
  6: "h-6",
  8: "h-8",
  10: "h-10",
  14: "h-14",
};
const sizes: Record<SpaceStep, string> = {
  1: "size-1",
  2: "size-2",
  3: "size-3",
  4: "size-4",
  5: "size-5",
  6: "size-6",
  8: "size-8",
  10: "size-10",
  14: "size-14",
};

const skeleton = cva("block shrink-0 bg-subtle motion-safe:animate-pulse", {
  variants: {
    shape: { text: "w-full rounded-lg", block: "w-full rounded-xl", circle: "rounded-full" },
    text: textSizeClasses,
    height: heights,
    size: sizes,
  },
});

export type SkeletonProps =
  { shape: "text"; size?: TextSize } | { shape: "block"; size: SpaceStep } | { shape: "circle"; size: SpaceStep };

export function Skeleton(props: SkeletonProps) {
  switch (props.shape) {
    case "text":
      // A non-breaking space gives the line the text size's own line height.
      return (
        <span aria-hidden className={skeleton({ shape: "text", text: props.size ?? "body" })}>
          {" "}
        </span>
      );
    case "block":
      return <span aria-hidden className={skeleton({ shape: "block", height: props.size })} />;
    case "circle":
      return <span aria-hidden className={skeleton({ shape: "circle", size: props.size })} />;
  }
}
