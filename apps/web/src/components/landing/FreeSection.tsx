import { Button, Card, Grid, Heading, MarketingOffer, Stack, Text } from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import { freeAccess } from "../../content/landing";

export function FreeSection() {
  return (
    <>
      <MarketingOffer start={<Link to="/sign-up" />} {...freeAccess} />
      <section aria-labelledby="plans-title">
        <Stack gap={6}>
          <div id="plans-title">
            <Heading level={2}>Practice at your pace</Heading>
          </div>
          <Grid columns={3}>
            <Card>
              <Stack gap={4}>
                <Heading level={3}>Free · $0</Heading>
                <Text>
                  25 live minutes each calendar month. Five new Lessons a day. Keep your Roadmap, progress and text
                  practice.
                </Text>
                <Button variant="secondary" render={<Link to="/sign-up" />}>
                  Start free
                </Button>
              </Stack>
            </Card>
            <Card>
              <Stack gap={4}>
                <Heading level={3}>Pro · $9/month</Heading>
                <Text>
                  150 live minutes per billing period. Unlimited Lessons, Lesson and Unit skipping, and streak recovery.
                </Text>
                <Text tone="muted">Tax included. Renews monthly until cancelled. Monthly minutes don't roll over.</Text>
                <Button render={<Link to="/profile" />}>Choose Pro</Button>
              </Stack>
            </Card>
            <Card>
              <Stack gap={4}>
                <Heading level={3}>Minute pack · $29 once</Heading>
                <Text>
                  500 live minutes with no expiry. All Pro features while any purchased minutes remain. Add a pack to
                  Free or Pro.
                </Text>
                <Text tone="muted">Tax included. No subscription or automatic top-up required.</Text>
                <Button variant="secondary" render={<Link to="/profile" />}>
                  Choose a minute pack
                </Button>
              </Stack>
            </Card>
          </Grid>
          <Text tone="muted">
            USD prices. Local-currency totals and conversion charges appear before payment. Recorded Lesson answers have
            a separate daily allowance. Streak recovery restores up to two missed days, once per billing period or
            calendar month for pack-only access.
          </Text>
        </Stack>
      </section>
    </>
  );
}
