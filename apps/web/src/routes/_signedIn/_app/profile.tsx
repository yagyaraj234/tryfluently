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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "../../../lib/auth";
import { progressQuery, roadmapQuery, skillProfileQuery } from "../../../lib/queries";
import { ProfileSummary } from "../../../components/profile/ProfileSummary";
import { saveTheme, type Theme } from "../../../lib/theme";

export const Route = createFileRoute("/_signedIn/_app/profile")({
  staticData: { title: "Profile" },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(roadmapQuery),
      context.queryClient.prefetchQuery(skillProfileQuery),
    ]),
  component: Profile,
});

const themes: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const zoneOption = (zone: string) => ({ value: zone, label: zone.replaceAll("_", " ") });

function Profile() {
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
          <ProfileSummary name={learner.name} />
        </Card>
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
  const accounts = useQuery({
    queryKey: ["linked-accounts"],
    enabled: typeof window !== "undefined",
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error("We couldn't load your sign-in methods. Try again.");
      return data;
    },
  });
  const requiresPassword = accounts.data?.some((account) => account.providerId === "credential");
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
    if (!accounts.isSuccess || (requiresPassword && !password)) return;
    setPending(true);
    setError(undefined);
    try {
      // Deleting the account also ends the session.
      // Google-only accounts require a fresh session; credential accounts always require their password.
      const { error } = await authClient.deleteUser(password ? { password } : {});
      if (error) {
        if (error.code === "SESSION_EXPIRED") {
          setSignInAgain(true);
          return setError("Sign in again, then return here to confirm deletion.");
        }
        return setError(
          error.code === "INVALID_PASSWORD"
            ? "That password isn't right."
            : "We couldn't delete your account. Try again.",
        );
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
        {accounts.isError && <Notice tone="error">{accounts.error.message}</Notice>}
        <Button variant="secondary" onClick={() => close(true)} disabled={pending || !accounts.isSuccess}>
          Delete your account
        </Button>
        {!deleting && error && <Notice tone="error">{error}</Notice>}
      </Stack>
      <Dialog
        open={deleting}
        onOpenChange={(open) => !pending && close(open)}
        title="Delete your account?"
        description={
          requiresPassword
            ? "Everything you've done in Impromptu is deleted, and it can't be undone. Enter your password to confirm."
            : "Everything you've done in Impromptu is deleted, and it can't be undone. If you haven't signed in recently, sign in again first."
        }
      >
        <form onSubmit={deleteAccount}>
          <Stack gap={4}>
            {requiresPassword && (
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                description="Enter your current password to delete your account."
                required
                disabled={pending}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {signInAgain && (
              <Button variant="secondary" render={<Link to="/sign-in" />}>
                Sign in again
              </Button>
            )}
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
