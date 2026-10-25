import { ErrorState } from "@fluently/ui";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Whether the browser is blocking the microphone. Once blocked it never asks again (only its site settings can
 * undo that), so "Try again" alone would look dead. When the Learner allows it there, `onAllowed` reconnects.
 * Browsers that can't report the microphone permission stay `false`, and "Try again" just asks again.
 */
function useMicrophoneBlocked(onAllowed: () => void) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let live = true;
    let status: PermissionStatus | undefined;
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then(
      (s) => {
        if (!live) return;
        status = s;
        setBlocked(s.state === "denied");
        s.onchange = () => (s.state === "granted" ? onAllowed() : setBlocked(s.state === "denied"));
      },
      () => {},
    );
    return () => {
      live = false;
      if (status) status.onchange = null;
    };
  }, [onAllowed]);
  return blocked;
}

/** The microphone was denied or is missing. "Try again" asks the browser again; a blocked one gets directions. */
export function MicrophoneProblem({
  needs,
  onRetry,
  action,
}: {
  /** What needs it, as a sentence: "A voice Roleplay needs your microphone." */
  needs: string;
  onRetry: () => void;
  action?: ReactNode;
}) {
  const blocked = useMicrophoneBlocked(onRetry);
  return (
    <ErrorState
      title="Allow your microphone"
      description={
        blocked
          ? `${needs} Your browser is blocking it for Fluently. Click the icon to the left of the address bar, turn on Microphone, and you'll connect as soon as you do.`
          : `${needs} Press Try again and choose Allow when your browser asks. If it doesn't ask, connect a microphone or allow it in your browser's site settings.`
      }
      onRetry={onRetry}
      action={action}
    />
  );
}
