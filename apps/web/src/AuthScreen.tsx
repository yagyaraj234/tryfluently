import { Button, Container, Heading, Notice, Screen, Stack, Text, TextField, TextLink } from "@impromptu/ui";
import { GoogleLogo } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "./api";
import { signInWithGoogle } from "./auth";

/** Route loader for sign-in and sign-up: is Google configured on the API? */
export const loadProviders = async () => (await api().api.auth.providers.$get()).json();

type Field = { name: string; label: string; type: string; autoComplete: string };

/** Sign-in and sign-up: the Google button when the API offers it, then an email form with its error inline. */
export function AuthScreen(props: {
  title: string;
  fields: Field[];
  submitLabel: string;
  google: boolean;
  /** An error to show on arrival, such as a failed Google sign-in. */
  initialError?: string;
  /** Resolves with Better Auth's error, if any. */
  onSubmit: (values: Record<string, string>) => Promise<{ error: { message?: string } | null }>;
  footer: ReactNode;
}) {
  const router = useRouter();
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
      await router.navigate({ to: "/" });
    } catch {
      setError("We couldn't reach Impromptu. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setError(undefined);
    const { error } = await signInWithGoogle();
    if (error) setError(error.message ?? "Google sign-in didn't work. Try again.");
  }

  return (
    <Screen surface="loud">
      <Container width="prose">
        <Stack gap={8}>
          <Stack gap={2}>
            <Text size="title">Impromptu</Text>
            <Heading level={1}>{props.title}</Heading>
          </Stack>
          {props.google && (
            <Stack gap={4}>
              <Button variant="secondary" icon={GoogleLogo} fullWidth onClick={google}>
                Continue with Google
              </Button>
              <Text tone="muted">or with your email</Text>
            </Stack>
          )}
          <form onSubmit={submit}>
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
          {props.footer}
        </Stack>
      </Container>
    </Screen>
  );
}

/** "No account yet? Create one" and the like. */
export function AuthFooter({ prompt, to, label }: { prompt: string; to: "/sign-in" | "/sign-up"; label: string }) {
  return (
    <Text>
      {prompt} <TextLink render={<Link to={to} />}>{label}</TextLink>
    </Text>
  );
}
