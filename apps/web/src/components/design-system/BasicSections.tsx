import {
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  IconButton,
  Split,
  Text,
  TextLink,
  VerdictTag,
  type TextSize,
} from "@impromptu/ui";
import { House, Microphone, SpeakerHigh } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Example, sample } from "./shared";

const sizes: TextSize[] = ["label", "caption", "body", "title", "heading", "page", "hero"];
const verdicts = ["correct", "almost", "incorrect"] as const;

export function Typography() {
  return (
    <Example title="Typography">
      {sizes.map((size) => (
        <Text key={size} size={size}>
          {size} · Speak with confidence
        </Text>
      ))}
      <Text tabular>Tabular numbers · 0123456789</Text>
      <Heading level={3}>Heading level 3</Heading>
    </Example>
  );
}

export function LayoutAndShells() {
  return (
    <Example title="Layout and shells">
      <Text>
        Screen sets the page background and gutters. Stack arranges vertically, Cluster wraps, Container limits reading
        width. Split stacks on phone and uses two thirds / one third at 64rem.
      </Text>
      <Split
        main={
          <Card>
            <Text>Main content</Text>
          </Card>
        }
        side={
          <Card>
            <Text>Side content</Text>
          </Card>
        }
      />
      <Cluster>
        <Button variant="secondary" render={<Link to="/design-system" search={{ preview: "app" }} />}>
          Preview AppShell
        </Button>
        <Button variant="secondary" render={<Link to="/design-system" search={{ preview: "practice" }} />}>
          Preview PracticeShell
        </Button>
      </Cluster>
      <Text>UIProvider at the page root supplies icons, overlays and toasts.</Text>
    </Example>
  );
}

export function ActionsAndDisplay() {
  return (
    <Example title="Actions and display">
      <Cluster>
        <Button onClick={sample}>Primary action</Button>
        <Button variant="secondary" icon={SpeakerHigh} onClick={sample}>
          Secondary action
        </Button>
        <Button disabled>Disabled</Button>
        <IconButton icon={Microphone} label="Microphone preview" onClick={sample} />
        <TextLink onClick={sample}>TextLink</TextLink>
      </Cluster>
      <Button fullWidth onClick={sample}>
        Full-width action
      </Button>
      <Card render={<Link to="/design-system" search={{ preview: "app" }} />}>
        <Text>Card rendered as a link</Text>
      </Card>
      <Cluster>
        <Chip>Paper chip</Chip>
        <Chip tone="soft" icon={House}>
          Soft chip
        </Chip>
        {verdicts.map((verdict) => (
          <VerdictTag key={verdict} verdict={verdict} />
        ))}
      </Cluster>
    </Example>
  );
}
