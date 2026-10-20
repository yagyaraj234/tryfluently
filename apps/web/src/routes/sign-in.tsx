import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { AuthFooter, AuthScreen, loadProviders } from "../components/auth/AuthScreen";

export const Route = createFileRoute("/sign-in")({
  // Better Auth sends a failed Google sign-in back here with `?error=`.
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === "string" ? { error: search.error } : {},
  loader: loadProviders,
  component: SignIn,
});

function SignIn() {
  const { google } = Route.useLoaderData();
  const { error } = Route.useSearch();
  const initialError = error && "Google sign-in didn't work. Try again, or use your email.";
  return (
    <AuthScreen
      mode="sign-in"
      title="Welcome back"
      google={google}
      initialError={initialError}
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="Sign in"
      onSubmit={({ email, password }) => authClient.signIn.email({ email: email!, password: password! })}
      footer={<AuthFooter prompt="New to Impromptu?" to="/sign-up" label="Create an account" />}
    />
  );
}
