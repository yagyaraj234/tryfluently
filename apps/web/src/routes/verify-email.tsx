import { AuthLayout, Stack, Text, TextLink } from "@impromptu/ui";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/verify-email")({ component: VerifyEmail });

function VerifyEmail() {
  return (
    <AuthLayout
      home={<Link to="/" />}
      storyLabel="One more step"
      badge="Confirm your email"
      storyTitle="Your account is almost ready."
      storyText="Open the verification email we sent, then return here to start practising."
      title="Check your inbox"
      subtitle="Use the verification link to confirm that this email belongs to you."
      footer={null}
    >
      <Stack gap={4}>
        <Text>Didn't receive it? Try signing in again to send a new verification email.</Text>
        <TextLink render={<Link to="/sign-in" />}>Back to sign in</TextLink>
      </Stack>
    </AuthLayout>
  );
}
