import { Notice, Select, Stack, toastManager } from "@impromptu/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../../lib/auth";
import { progressQuery } from "../../lib/queries";

const zoneOption = (zone: string) => ({ value: zone, label: zone.replaceAll("_", " ") });

export function TimezoneSelect({ saved }: { saved: string }) {
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
    await Promise.all([queryClient.invalidateQueries(progressQuery), router.invalidate()]);
  }

  return (
    <Stack gap={3}>
      <Select label="Timezone" options={options} value={zone} onValueChange={change} />
      {error && <Notice tone="error">{error}</Notice>}
    </Stack>
  );
}
