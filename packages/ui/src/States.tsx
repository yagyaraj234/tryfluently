import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Cluster } from "./Cluster";
import { Heading } from "./Heading";
import { Mascot } from "./Mascot";
import { Text } from "./Text";

// Empty, loading and error share one centred column, so every screen waits and fails the same way.
const state = cva("mx-auto flex max-w-prose flex-col items-center gap-4 py-14 text-center");
const icon = cva("text-hero text-muted");

export type EmptyStateProps = {
  icon?: Icon;
  title: string;
  description?: string;
  /** What the Learner can do next, for example a Button. */
  action?: ReactNode;
};

/** Shown when there's nothing to list yet. */
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
  /** What is loading, for example "Your next Step is being prepared". */
  title: string;
  description?: string;
};

/** A whole screen or section waiting on data, or on a Step being generated. */
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
  onRetry: () => void;
  retryLabel?: string;
  /** Another way forward, after the retry, for example "Type instead" when the microphone is blocked. */
  action?: ReactNode;
};

/** Something failed to load or save; the Learner can try again. */
export function ErrorState({ title = "Something went wrong", description, onRetry, retryLabel = "Try again", action }: ErrorStateProps) {
  return (
    <div role="alert" className={state()}>
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
