import { AuthLayout, Button, Cluster, Notice, Stack, Text, TextField, TextLink, type AuthPoint } from "@fluently/ui";
import { Microphone, Path, Sparkle } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../lib/api";
import { signInWithGoogle } from "../../lib/auth";

export const loadProviders = async () => (await api().api.auth.providers.$get()).json();

type Field = { name: string; label: string; type: string; autoComplete: string };

const steps: AuthPoint[] = [
  { icon: Sparkle, title: "Set a Goal", body: "Tell us what you want English for." },
  { icon: Microphone, title: "Take the Assessment", body: "Talk or type for up to 10 minutes." },
  { icon: Path, title: "Follow your Roadmap", body: "Practice with Lessons made for you." },
];
const waiting: AuthPoint = {
  icon: Path,
  title: "Your Roadmap is ready",
  body: "Open it to pick up your next Lesson.",
};

const signUpStory = {
  storyLabel: "Getting started with Fluently",
  badge: "Free assessment",
  storyTitle: "Start with a Goal.",
  storyText: "Practise the conversations you need, one at a time.",
  steps,
  note: undefined,
};
const signInStory = {
  storyLabel: "Welcome back to Fluently",
  badge: "Your progress is saved",
  storyTitle: "Pick up where you left off.",
  storyText: "Your Roadmap and next conversation are ready when you are.",
  steps: undefined,
  note: waiting,
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.35 12.2c0-.68-.06-1.36-.18-2H12v3.79h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.13c1.83-1.69 2.92-4.18 2.92-7.17Z"
      />
      <path
        fill="#34A853"
        d="M12 21.7c2.62 0 4.82-.87 6.43-2.33l-3.13-2.44c-.87.58-1.98.93-3.3.93-2.54 0-4.7-1.72-5.47-4.03H3.3v2.52A9.71 9.71 0 0 0 12 21.7Z"
      />
      <path fill="#FBBC05" d="M6.53 13.83a5.83 5.83 0 0 1 0-3.66V7.65H3.3a9.72 9.72 0 0 0 0 8.7l3.23-2.52Z" />
      <path
        fill="#EA4335"
        d="M12 6.14c1.43 0 2.72.49 3.74 1.47l2.8-2.8A9.36 9.36 0 0 0 12 2.3a9.71 9.71 0 0 0-8.7 5.35l3.23 2.52C7.3 7.86 9.46 6.14 12 6.14Z"
      />
    </svg>
  );
}

export function AuthScreen(props: {
  mode: "sign-in" | "sign-up";
  title: string;
  fields: Field[];
  submitLabel: string;
  google: boolean;
  initialError?: string;
  onSubmit: (values: Record<string, string>) => Promise<{ error: { message?: string } | null }>;
  successTo?: "/home" | "/verify-email";
  footer: ReactNode;
}) {
  const signingUp = props.mode === "sign-up";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState(props.initialError);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    try {
      const { error } = await props.onSubmit(values);
      if (error) return setError(error.message ?? "That didn't work. Try again.");
      queryClient.clear();
      await router.navigate({ to: props.successTo ?? "/home" });
    } catch {
      setError("We couldn't reach Fluently. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setPending(true);
    setError(undefined);
    try {
      const { error } = await signInWithGoogle();
      if (error) setError(error.message ?? "Google sign-in didn't work. Try again.");
    } catch {
      setError("We couldn't reach Google sign-in. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const story = signingUp ? signUpStory : signInStory;
  const alternative = props.google && (
    <Button variant="secondary" fullWidth onClick={google} disabled={pending}>
      <Cluster gap={3} wrap={false}>
        <GoogleMark /> <span>Continue with Google</span>
      </Cluster>
    </Button>
  );

  return (
    <AuthLayout
      home={<Link to="/" />}
      {...story}
      title={props.title}
      subtitle={props.google ? "Continue with email or Google." : "Continue with your email."}
      footer={props.footer}
      alternative={alternative}
    >
      {/* method="post" keeps credentials out of the URL if the form is submitted before the page has hydrated. */}
      <form method="post" onSubmit={submit}>
        <Stack gap={5}>
          {props.fields.map((field) => (
            <TextField key={field.name} {...field} required />
          ))}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" fullWidth disabled={pending}>
            {props.submitLabel}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}

export function AuthFooter({ prompt, to, label }: { prompt: string; to: "/sign-in" | "/sign-up"; label: string }) {
  return (
    <Text>
      {prompt} <TextLink render={<Link to={to} />}>{label}</TextLink>
    </Text>
  );
}
