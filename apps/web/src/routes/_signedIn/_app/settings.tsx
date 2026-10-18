import {
  Button,
  Card,
  ChoiceChips,
  Cluster,
  Container,
  Dialog,
  Heading,
  Notice,
  Select,
  Stack,
  Text,
  TextField,
  toastManager,
} from "@impromptu/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "../../../lib/auth";
import { progressQuery } from "../../../lib/queries";
import { saveTheme, type Theme } from "../../../lib/theme";

export const Route = createFileRoute("/_signedIn/_app/settings")({ staticData: { title: "Settings" }, component: Settings });

const themes: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const zoneOption = (zone: string) => ({ value: zone, label: zone.replaceAll("_", " ") });

function Settings() {
  const { theme, learner } = Route.useRouteContext();
  const router = useRouter();

  function pickTheme(value: string) {
    saveTheme(value as Theme);
    return router.invalidate();
  }

  return (
    <Container width="prose">
      <Stack gap={8}>
        <Card>
          <Stack gap={6}>
            <ChoiceChips label="Theme" options={themes} value={theme ?? "system"} onValueChange={pickTheme} />
            <TimezoneSelect saved={learner.timezone} />
          </Stack>
        </Card>
        <Account />
      </Stack>
    </Container>
  );
}

function TimezoneSelect({ saved }: { saved: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [zone, setZone] = useState(saved);
  const [error, setError] = useState<string>();
  // The browser's list can miss an alias the Learner saved (Asia/Kolkata vs Asia/Calcutta), so keep theirs in it.
  const zones = Intl.supportedValuesOf("timeZone");
  const options = (zones.includes(saved) ? zones : [saved, ...zones]).map(zoneOption);

  async function change(value: string) {
    setZone(value);
    setError(undefined);
    const { error } = await authClient.updateUser({ timezone: value }).catch(() => ({ error: true }));
    if (error) {
      setZone(saved);
      return setError("We couldn't save your timezone. Try again.");
    }
    toastManager.add({ title: "Timezone saved", description: "Your Streak and daily limits now follow it." });
    // The Streak is counted in local days.
    await Promise.all([queryClient.invalidateQueries(progressQuery), router.invalidate()]);
  }

  return (
    <Stack gap={3}>
      <Select label="Timezone" options={options} value={zone} onValueChange={change} />
      {error && <Notice tone="error">{error}</Notice>}
    </Stack>
  );
}

function Account() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [signInAgain, setSignInAgain] = useState(false);

  async function signOut() {
    setPending(true);
    setError(undefined);
    try {
      const { error } = await authClient.signOut();
      if (error) return setError("We couldn't sign you out. Try again.");
      queryClient.clear();
      await router.navigate({ to: "/sign-in" });
    } catch {
      setError("We couldn't reach Impromptu. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      // Deleting the account also ends the session.
      // Better Auth permits passwordless deletion only with a fresh session, including Google accounts.
      const { error } = await authClient.deleteUser(password ? { password } : {});
      if (error) {
        if (error.code === "SESSION_EXPIRED") {
          setSignInAgain(true);
          return setError("Sign in again, then return here to confirm deletion.");
        }
        return setError(error.code === "INVALID_PASSWORD" ? "That password isn't right." : "We couldn't delete your account. Try again.");
      }
      queryClient.clear();
      await router.navigate({ to: "/sign-up" });
    } catch {
      setError("We couldn't reach Impromptu. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function close(open: boolean) {
    setDeleting(open);
    setPassword("");
    setError(undefined);
    setSignInAgain(false);
  }

  return (
    <Card>
      <Stack gap={4} align="start">
        <Heading level={2} size="title">
          Account
        </Heading>
        <Button variant="secondary" onClick={signOut} disabled={pending}>
          Sign out
        </Button>
        <Text tone="muted">Deleting your account removes your Goals, Assessments, Lessons and progress for good.</Text>
        <Button variant="secondary" onClick={() => close(true)} disabled={pending}>
          Delete your account
        </Button>
        {!deleting && error && <Notice tone="error">{error}</Notice>}
      </Stack>
      <Dialog
        open={deleting}
        onOpenChange={(open) => !pending && close(open)}
        title="Delete your account?"
        description="Everything you've done in Impromptu is deleted, and it can't be undone. Confirm below. If you haven't signed in recently, enter your password or sign in again first."
      >
        <form onSubmit={deleteAccount}>
          <Stack gap={4}>
            <TextField
              label="Password (optional)"
              type="password"
              autoComplete="current-password"
              description="Leave blank if you signed in recently, including with Google."
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && <Notice tone="error">{error}</Notice>}
            {signInAgain && <Button variant="secondary" render={<Link to="/sign-in" />}>Sign in again</Button>}
            <Cluster justify="end">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => close(false)}>
                Keep my account
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Deleting…" : "Delete my account"}
              </Button>
            </Cluster>
          </Stack>
        </form>
      </Dialog>
    </Card>
  );
}
