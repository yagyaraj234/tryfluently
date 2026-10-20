import { WarningCircle, type Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Cluster } from "./Cluster";
import { Heading } from "./Heading";
import { Mascot } from "./Mascot";
import { Text } from "./Text";

const state = cva("mx-auto flex max-w-prose flex-col items-center gap-4 py-14 text-center");
const icon = cva("text-hero text-muted");

export type EmptyStateProps = {
  icon?: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: StateIcon, title, description, action }: EmptyStateProps) {
  return (
    <div className={state()}>
      {StateIcon && (
        <span className={icon()}>
          <StateIcon aria-hidden />
        </span>
      )}
      <Heading level={2} size="title">
        {title}
      </Heading>
      {description && <Text tone="muted">{description}</Text>}
      {action}
    </div>
  );
}

export type LoadingStateProps = {
  title: string;
  description?: string;
};

export function LoadingState({ title, description }: LoadingStateProps) {
  return (
    <div role="status" className={state()}>
      <Mascot name="hush" />
      <Text size="title">{title}</Text>
      {description && <Text tone="muted">{description}</Text>}
    </div>
  );
}

export type ErrorStateProps = {
  title?: string;
  description?: string;
  icon?: Icon;
  onRetry: () => void;
  retryLabel?: string;
  action?: ReactNode;
};

export function ErrorState({
  title = "Something went wrong",
  description,
  icon: StateIcon = WarningCircle,
  onRetry,
  retryLabel = "Try again",
  action,
}: ErrorStateProps) {
  return (
    <div role="alert" className={state()}>
      <span className={icon()}>
        <StateIcon aria-hidden />
      </span>
      <Heading level={2} size="title">
        {title}
      </Heading>
      {description && <Text tone="muted">{description}</Text>}
      <Cluster gap={3} justify="center">
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
        {action}
      </Cluster>
    </div>
  );
}
