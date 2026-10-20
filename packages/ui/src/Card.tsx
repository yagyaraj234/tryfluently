import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { ComponentProps, ReactElement } from "react";

export const cardClasses = "rounded-3xl border border-line bg-paper p-6 text-ink shadow-card";

const compactCardClasses = "overflow-hidden rounded-3xl border border-line bg-paper p-5 text-ink shadow-card";

export type CardProps = Omit<ComponentProps<"div">, "className" | "style"> & {
  render?: ReactElement;
  size?: "md" | "sm";
};

export function Card({ render, size = "md", ...props }: CardProps) {
  const className = size === "md" ? `block ${cardClasses}` : `block ${compactCardClasses}`;
  return useRender({
    render: render ?? <div />,
    props: mergeProps<"div">({ className }, props),
  });
}
