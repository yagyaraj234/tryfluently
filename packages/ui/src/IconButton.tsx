import { Button as BaseButton } from "@base-ui/react/button";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";
import { pressable } from "./Button";

const iconButton = cva(`${pressable} size-target bg-paper text-title text-ink`);

export type IconButtonProps = Omit<ComponentProps<"button">, "className" | "style" | "children" | "aria-label"> & {
  icon: Icon;
  /** The accessible name. Required: an icon alone says nothing to a screen reader. */
  label: string;
  /** Renders this element instead of a button, for example a router link. It receives our props, classes and ref. */
  render?: ReactElement;
};

export function IconButton({ icon: Icon, label, render, ...props }: IconButtonProps) {
  return useRender({
    render: render ?? <BaseButton />,
    props: mergeProps<"button">({ className: iconButton(), "aria-label": label, children: <Icon aria-hidden /> }, props),
  });
}
