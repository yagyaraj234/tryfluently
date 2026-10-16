import { createFileRoute } from "@tanstack/react-router";
import { signUp } from "../auth";
import { AuthFooter, AuthScreen, loadProviders } from "../AuthScreen";

export const Route = createFileRoute("/sign-up")({ loader: loadProviders, component: SignUp });

function SignUp() {
  const { google } = Route.useLoaderData();
  return (
    <AuthScreen
      title="Get fluent for the moments that matter"
      google={google}
      fields={[
        { name: "name", label: "Name", type: "text", autoComplete: "name" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
      ]}
      submitLabel="Create account"
      onSubmit={({ name, email, password }) => signUp({ name: name!, email: email!, password: password! })}
      footer={<AuthFooter prompt="Already have an account?" to="/sign-in" label="Sign in" />}
    />
  );
}
