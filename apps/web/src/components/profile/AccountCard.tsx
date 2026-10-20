import { SignOut, Trash } from "@phosphor-icons/react";
import { Button, Card, Heading, Notice, Stack, Text } from "@impromptu/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "../../lib/auth";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

const unreachable = "We couldn't reach Impromptu. Check your connection and try again.";

function deleteError(code: string | undefined) {
  if (code === "INVALID_PASSWORD") return "That password isn't right.";
  return "We couldn't delete your account. Try again.";
}

export function AccountCard() {
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
      setError(unreachable);
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
      // Google-only accounts require a fresh session; credential accounts always require their password.
      const { error } = await authClient.deleteUser(password ? { password } : {});
      if (error) {
        if (error.code === "SESSION_EXPIRED") {
          setSignInAgain(true);
          return setError("Sign in again, then return here to confirm deletion.");
        }
        return setError(deleteError(error.code));
      }
      queryClient.clear();
      await router.navigate({ to: "/sign-up" });
    } catch {
      setError(unreachable);
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
        <Button variant="secondary" icon={SignOut} onClick={signOut} disabled={pending}>
          Sign out
        </Button>
        <Text tone="muted">Deleting your account removes your Goals, Assessments, Lessons and progress for good.</Text>
        {accounts.isError && <Notice tone="error">{accounts.error.message}</Notice>}
        <Button variant="danger" icon={Trash} onClick={() => close(true)} disabled={pending || !accounts.isSuccess}>
          Delete your account
        </Button>
        {!deleting && error && <Notice tone="error">{error}</Notice>}
      </Stack>
      <DeleteAccountDialog
        open={deleting}
        pending={pending}
        requiresPassword={requiresPassword}
        password={password}
        error={error}
        signInAgain={signInAgain}
        onPasswordChange={setPassword}
        onOpenChange={close}
        onSubmit={deleteAccount}
      />
    </Card>
  );
}
