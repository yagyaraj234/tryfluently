import { Button as BaseButton } from "@base-ui/react/button";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

const textLink = cva("inline-flex min-h-11 items-center rounded-lg font-bold text-primary underline");

export type TextLinkProps = Omit<ComponentProps<"button">, "className" | "style"> & {
  /** Renders this element instead of a button, for example a router link. It receives our props, classes and ref. */
  render?: ReactElement;
};

/** An inline link. A button by default (for actions like "Type instead"); pass `render` to navigate. */
export function TextLink({ render, ...props }: TextLinkProps) {
  return useRender({
    render: render ?? <BaseButton />,
    props: mergeProps<"button">({ className: textLink() }, props),
  });
}
