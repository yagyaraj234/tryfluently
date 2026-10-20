import { Grid, Heading, Stack, UnitCard } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { roadmapQuery } from "../../lib/queries";

export function UpNext() {
  const roadmap = useQuery(roadmapQuery);
  const upNext = roadmap.data?.filter((u) => u.status === "planned").slice(0, 4) ?? [];
  if (!upNext.length) return null;

  return (
    <Stack gap={4}>
      <Heading level={2} size="title">
        Up next on your Roadmap
      </Heading>
      <Grid>
        {upNext.map((u) => (
          <UnitCard
            key={u.id}
            cover
            level={3}
            title={u.title}
            objective={u.objective}
            status={u.status}
            number={u.position + 1}
            skill={u.skills[0]}
            render={<Link to="/roadmap/$unitId" params={{ unitId: u.id }} />}
          />
        ))}
      </Grid>
    </Stack>
  );
}
