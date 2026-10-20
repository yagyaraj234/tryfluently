import { ChoiceChips, Select, Switch, TextArea, TextField } from "@fluently/ui";
import { Example } from "./shared";

export function FormsSection() {
  return (
    <Example title="Forms">
      <TextField
        label="Goal Context title"
        description="A short label for your situation."
        defaultValue="My next interview"
      />
      <TextField
        label="Email error state"
        type="email"
        defaultValue="asha"
        error="Enter an email address, such as asha@example.com."
      />
      <TextField label="Disabled field" defaultValue="Saved value" disabled />
      <TextArea label="Goal Context" rows={3} description="0 / 20,000 characters" />
      <ChoiceChips
        label="Single choice"
        layout="segmented"
        options={[
          { value: "voice", label: "Speak" },
          { value: "text", label: "Type" },
        ]}
        defaultValue="voice"
      />
      <ChoiceChips
        multiple
        label="Multiple choice"
        options={[
          { value: "job", label: "Job Interview" },
          { value: "client", label: "Client Communication" },
        ]}
        defaultValue={["job"]}
      />
      <Select
        label="Target Level"
        options={[
          { value: "B1", label: "B1" },
          { value: "B2", label: "B2" },
          { value: "C1", label: "C1" },
        ]}
        defaultValue="B2"
      />
      <Select label="Disabled select" options={[{ value: "B2", label: "B2" }]} defaultValue="B2" disabled />
      <Switch label="Switch preview" defaultChecked />
      <Switch label="Disabled switch" disabled />
    </Example>
  );
}
