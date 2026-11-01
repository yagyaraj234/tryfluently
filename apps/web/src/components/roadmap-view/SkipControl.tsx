import { Button, Dialog, Notice, Stack, TextLink } from "@fluently/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../lib/api";
import { billingQuery, roadmapQuery } from "../../lib/queries";

export function SkipControl({ target, title }: { target: { unitId: string } | { position: number }; title: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const billing = useQuery(billingQuery);
  const skip = useMutation({
    mutationFn: async () => {
      const response =
        "unitId" in target
          ? await api().api.roadmap.units[":id"].skip.$post({ param: { id: target.unitId } })
          : await api().api.lessons[":position{[0-9]+}"].skip.$post({ param: { position: String(target.position) } });
      if (!response.ok) {
        const body = await response.json();
        throw new Error("error" in body ? body.error : "Skipping failed. Please try again.");
      }
    },
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries(roadmapQuery);
    },
  });
  if (!billing.data?.hasPro) return <TextLink render={<Link to="/profile" />}>Unlock Pro to skip</TextLink>;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Skip {"unitId" in target ? "Unit" : "Lesson"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => !skip.isPending && setOpen(value)}
        title={`Skip ${title}?`}
        description="Continue to what's next. Skipping earns no completion credit, XP or streak activity. Completed work stays saved."
      >
        <Stack gap={3}>
          {skip.error && <Notice tone="error">{skip.error.message}</Notice>}
          <Button disabled={skip.isPending} onClick={() => skip.mutate()}>
            {skip.isPending ? "Skipping…" : "Skip and continue"}
          </Button>
          <Button variant="secondary" disabled={skip.isPending} onClick={() => setOpen(false)}>
            Keep learning
          </Button>
        </Stack>
      </Dialog>
    </>
  );
}
