import { createFileRoute } from "@tanstack/react-router";
import { signUp } from "../lib/auth";
import { AuthFooter, AuthScreen, loadProviders } from "../components/auth/AuthScreen";
import { publicPageHead } from "../lib/site";

export const Route = createFileRoute("/sign-up")({
  head: () =>
    publicPageHead(
      "/sign-up",
      "Start Your Free English Assessment | Fluently",
      "Create a free Fluently account to assess your English speaking or writing. Set a Goal and start adaptive Lessons and Roleplays with your AI coach.",
    ),
  loader: loadProviders,
  component: SignUp,
});

function SignUp() {
  const { google } = Route.useLoaderData();
  return (
    <AuthScreen
      mode="sign-up"
      title="Create your account"
      google={google}
      fields={[
        { name: "name", label: "Name", type: "text", autoComplete: "name" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
      ]}
      submitLabel="Create account"
      onSubmit={({ name, email, password }) => signUp({ name: name!, email: email!, password: password! })}
      successTo="/verify-email"
      footer={<AuthFooter prompt="Already have an account?" to="/sign-in" label="Sign in" />}
    />
  );
}
