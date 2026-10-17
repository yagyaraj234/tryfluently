import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getServerTime = createServerFn({ method: "GET" }).handler(() =>
  new Date().toISOString(),
);

const serverTimeQuery = queryOptions({
  queryKey: ["server-time"],
  queryFn: () => getServerTime(),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(serverTimeQuery),
  component: Home,
});

function Home() {
  const { data: serverTime } = useSuspenseQuery(serverTimeQuery);

  return (
    <main>
      <h1>Impromptu</h1>
      <p>TanStack Start + TanStack Query with server-side rendering.</p>
      <p>
        Server time: <time dateTime={serverTime}>{serverTime}</time>
      </p>
    </main>
  );
}
