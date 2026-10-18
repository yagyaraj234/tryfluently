import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { ComponentProps, ReactElement } from "react";

// White on the warm grey page, with a hairline and a soft shadow.
export const cardClasses = "rounded-3xl border border-line bg-paper p-5 text-ink shadow-card";

export type CardProps = Omit<ComponentProps<"div">, "className" | "style"> & {
  /**
   * Renders this element instead of a div, for example a router link, so the whole card is one tap target.
   * It receives our props, classes and ref.
   */
  render?: ReactElement;
};

export function Card({ render, ...props }: CardProps) {
  return useRender({
    render: render ?? <div />,
    props: mergeProps<"div">({ className: `block ${cardClasses}` }, props),
  });
}
