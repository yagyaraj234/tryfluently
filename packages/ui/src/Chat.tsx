import { cva } from "class-variance-authority";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { Cluster } from "./Cluster";
import { Skeleton } from "./Skeleton";
import { Text } from "./Text";
import { TextArea } from "./TextArea";

// ---- The conversation -------------------------------------------------------------------------------------------

const thread = cva(
  "flex max-h-[45dvh] flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl py-1 pr-1 sm:max-h-[55dvh]",
);

export type ChatThreadProps = {
  /** The conversation, for screen readers, for example "Roleplay with the interviewer". */
  label: string;
  /** While a reply streams, new text is not announced a token at a time. */
  busy?: boolean;
  children?: ReactNode;
};

/**
 * A chat log that stays at its latest turn, unless the Learner has scrolled back to read something.
 * Place the turns in order: coach turns settle left and the Learner's right.
 */
export function ChatThread({ label, busy, children }: ChatThreadProps) {
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  function rememberPosition() {
    const element = log.current;
    if (!element) return;
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  // Runs after every render, so it also follows text as it streams in.
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
      className={thread()}
    >
      {children}
    </div>
  );
}

// ---- Waiting for a reply ----------------------------------------------------------------------------------------

const writingBubble = cva(
  "flex max-w-[85%] flex-col gap-2 self-start rounded-2xl rounded-tl-sm border border-line bg-paper px-5 py-4",
);

export type ChatWritingProps = {
  /** Who is writing, for screen readers: the character in a Roleplay, for example "Interviewer". @default "Coach" */
  name?: string;
};

/** The coach's turn before its first words arrive: a skeleton in the shape of a chat bubble. */
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

// ---- Writing a reply --------------------------------------------------------------------------------------------

export type ChatComposerProps = {
  /** The textarea's label, for example "Your reply". */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  /** A reply is on its way; the Learner can type, but not send. */
  pending?: boolean;
  disabled?: boolean;
  maxLength?: number;
  hint?: string;
};

/** A chat's reply box: Enter sends, Shift+Enter starts a new line, and an empty message can't be sent. */
export function ChatComposer({
  label,
  value,
  onValueChange,
  onSend,
  placeholder,
  pending = false,
  disabled = false,
  maxLength,
  hint = "Press Enter to send. Shift + Enter starts a new line.",
}: ChatComposerProps) {
  const canSend = value.trim().length > 0 && !pending && !disabled;

  function send() {
    if (canSend) onSend();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Keep Enter for sending. A composing Enter (Japanese, for example) belongs to the input method.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

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
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>
        <Text size="caption" tone="muted">
          {hint}
        </Text>
      </div>
    </form>
  );
}

// ---- Loading the whole conversation -----------------------------------------------------------------------------

const skeletonBubble = cva("flex flex-col gap-2 rounded-2xl border border-line bg-paper px-5 py-4");

export type ChatSkeletonProps = {
  /** What is loading, for example "Loading your Roleplay". */
  label?: string;
};

/** A conversation placeholder for a screen that is still loading. */
export function ChatSkeleton({ label = "Loading your conversation" }: ChatSkeletonProps) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-6">
      <div aria-hidden className="flex flex-col gap-6">
        <Cluster justify="between">
          <span className="w-40">
            <Skeleton shape="text" size="label" />
          </span>
          <Skeleton shape="circle" size={8} />
        </Cluster>
        <span className="w-3/4">
          <Skeleton shape="text" />
        </span>
        <div className="flex flex-col gap-5">
          <div className={`${skeletonBubble()} w-11/12 self-start`}>
            <Skeleton shape="text" />
            <span className="w-2/3">
              <Skeleton shape="text" />
            </span>
          </div>
          <div className="flex w-1/2 flex-col gap-2 self-end rounded-2xl rounded-tr-sm bg-primary-soft px-5 py-4">
            <Skeleton shape="text" />
          </div>
          <div className={`${skeletonBubble()} w-4/5 self-start`}>
            <Skeleton shape="text" />
            <span className="w-1/2">
              <Skeleton shape="text" />
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton shape="block" size={14} />
          <span className="w-28">
            <Skeleton shape="block" size={10} />
          </span>
        </div>
      </div>
    </div>
  );
}
