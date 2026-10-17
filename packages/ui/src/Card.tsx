import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

// shadow-card comes from the surface: the offset shadow on loud, none on quiet.
const card = cva("block rounded-md border-2 border-line bg-paper p-5 text-ink shadow-card focus-visible:focus-ring");

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
    props: mergeProps<"div">({ className: card() }, props),
  });
}
