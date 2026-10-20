import { Button as BaseButton } from "@base-ui/react/button";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

const textLink = cva(
  "inline-flex min-h-11 cursor-pointer items-center gap-2 data-disabled:cursor-not-allowed rounded-lg font-bold text-primary underline",
);

export type TextLinkProps = Omit<ComponentProps<"button">, "className" | "style"> & {
  render?: ReactElement;
};

export function TextLink({ render, ...props }: TextLinkProps) {
  return useRender({
    render: render ?? <BaseButton />,
    props: mergeProps<"button">({ className: textLink() }, props),
  });
}
