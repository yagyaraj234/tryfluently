import { Button, Cluster, Dialog, Notice, Stack, TextField } from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";

const description = "Everything you've done in Fluently is deleted, and it can't be undone.";

type Props = {
  open: boolean;
  pending: boolean;
  requiresPassword: boolean | undefined;
  password: string;
  error: string | undefined;
  signInAgain: boolean;
  onPasswordChange: (password: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function DeleteAccountDialog(props: Props) {
  const { open, pending, requiresPassword, password, error, signInAgain } = props;
  const dialogDescription = requiresPassword
    ? `${description} Enter your password to confirm.`
    : `${description} If you haven't signed in recently, sign in again first.`;

  const passwordField = requiresPassword && (
    <TextField
      label="Password"
      type="password"
      autoComplete="current-password"
      description="Enter your current password to delete your account."
      required
      disabled={pending}
      value={password}
      onChange={(event) => props.onPasswordChange(event.target.value)}
    />
  );

  const signInLink = signInAgain && (
    <Button variant="secondary" render={<Link to="/sign-in" />}>
      Sign in again
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !pending && props.onOpenChange(next)}
      title="Delete your account?"
      description={dialogDescription}
    >
      <form onSubmit={props.onSubmit}>
        <Stack gap={4}>
          {passwordField}
          {error && <Notice tone="error">{error}</Notice>}
          {signInLink}
          <Cluster justify="end">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => props.onOpenChange(false)}>
              Keep my account
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Deleting…" : "Delete my account"}
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Dialog>
  );
}
