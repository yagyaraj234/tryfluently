import { Button as BaseButton } from "@base-ui/react/button";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";
import { pressableClasses } from "./Button";

const iconButton = cva(
  `${pressableClasses} size-11 border border-line bg-subtle text-title text-ink not-data-disabled:hover:bg-line`,
);

export type IconButtonProps = Omit<ComponentProps<"button">, "className" | "style" | "children" | "aria-label"> & {
  icon: Icon;
  label: string;
  render?: ReactElement;
};

export function IconButton({ icon: Icon, label, render, ...props }: IconButtonProps) {
  return useRender({
    render: render ?? <BaseButton />,
    props: mergeProps<"button">(
      { className: iconButton(), "aria-label": label, children: <Icon aria-hidden /> },
      props,
    ),
  });
}
