import { cva } from "class-variance-authority";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { Cluster } from "./Cluster";
import { Skeleton } from "./Skeleton";
import { Text } from "./Text";
import { TextArea } from "./TextArea";

const thread = cva(
  "flex max-h-[45dvh] flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl py-1 pr-3 sm:max-h-[55dvh] [&[data-ready]>*]:transition [&[data-ready]>*]:duration-press [&[data-ready]>*]:ease-ui [&[data-ready]>*]:starting:opacity-0 motion-safe:[&[data-ready]>*]:starting:translate-y-1.5",
);

export type ChatThreadProps = {
  label: string;
  busy?: boolean;
  children?: ReactNode;
};

export function ChatThread({ label, busy, children }: ChatThreadProps) {
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [ready, setReady] = useState(false);

  // Bubbles present on first render stay put; only later arrivals animate in.
  useEffect(() => setReady(true), []);

  function rememberPosition() {
    const element = log.current;
    if (!element) return;
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  useEffect(() => {
    const element = log.current;
    if (!element || !follow.current) return;
    element.scrollTop = element.scrollHeight;
  });

  return (
    <div
      ref={log}
      role="log"
      aria-label={label}
      aria-live={busy ? "off" : "polite"}
      tabIndex={0}
      onScroll={rememberPosition}
      data-ready={ready || undefined}
      className={thread()}
    >
      {children}
    </div>
  );
}

const writingBubble = cva(
  "flex max-w-[85%] flex-col gap-2 self-start rounded-2xl rounded-tl-sm border border-line bg-paper px-5 py-4",
);

export type ChatWritingProps = {
  name?: string;
};

export function ChatWriting({ name = "Coach" }: ChatWritingProps) {
  return (
    <div role="status" aria-label={`${name} is writing`} className={writingBubble()}>
      <span aria-hidden className="flex w-44 flex-col gap-2">
        <Skeleton shape="text" />
        <span className="w-3/4">
          <Skeleton shape="text" />
        </span>
      </span>
    </div>
  );
}

export type ChatComposerProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  pending?: boolean;
  disabled?: boolean;
  maxLength?: number;
  hint?: string;
};

export function ChatComposer({
  label,
  value,
  onValueChange,
  onSend,
  placeholder,
  pending = false,
  disabled = false,
  maxLength = 2000,
  hint = "Press Enter to send. Shift + Enter starts a new line.",
}: ChatComposerProps) {
  const canSend = value.trim().length > 0 && value.length <= maxLength && !pending && !disabled;

  function send() {
    if (canSend) onSend();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // a composing Enter (IME) belongs to the input method
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

  const sendLabel = pending ? "Sending…" : "Send";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextArea
              label={label}
              value={value}
              onValueChange={onValueChange}
              onKeyDown={keyDown}
              rows={2}
              maxLength={maxLength}
              placeholder={placeholder}
              enterKeyHint="send"
            />
          </div>
          <Button type="submit" disabled={!canSend}>
            {sendLabel}
          </Button>
        </div>
        <Text size="caption" tone="muted">
          {hint}
        </Text>
      </div>
    </form>
  );
}

const skeletonBubble = cva("flex flex-col gap-2 rounded-2xl border border-line bg-paper px-5 py-4");

export type ChatSkeletonProps = {
  label?: string;
};

function SkeletonLine({ width }: { width?: string }) {
  if (!width) return <Skeleton shape="text" />;
  return (
    <span className={width}>
      <Skeleton shape="text" />
    </span>
  );
}

function SkeletonHeader() {
  return (
    <>
      <Cluster justify="between">
        <span className="w-40">
          <Skeleton shape="text" size="label" />
        </span>
        <Skeleton shape="circle" size={8} />
      </Cluster>
      <SkeletonLine width="w-3/4" />
    </>
  );
}

function SkeletonBubbles() {
  return (
    <div className="flex flex-col gap-5">
      <div className={`${skeletonBubble()} w-11/12 self-start`}>
        <SkeletonLine />
        <SkeletonLine width="w-2/3" />
      </div>
      <div className="flex w-1/2 flex-col gap-2 self-end rounded-2xl rounded-tr-sm bg-primary-soft px-5 py-4">
        <Skeleton shape="text" />
      </div>
      <div className={`${skeletonBubble()} w-4/5 self-start`}>
        <SkeletonLine />
        <SkeletonLine width="w-1/2" />
      </div>
    </div>
  );
}

function SkeletonComposer() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton shape="block" size={14} />
      <span className="w-28">
        <Skeleton shape="block" size={10} />
      </span>
    </div>
  );
}

export function ChatSkeleton({ label = "Loading your conversation" }: ChatSkeletonProps) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-6">
      <div aria-hidden className="flex flex-col gap-6">
        <SkeletonHeader />
        <SkeletonBubbles />
        <SkeletonComposer />
      </div>
    </div>
  );
}
