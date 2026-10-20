import { FileText } from "@phosphor-icons/react";
import { Button, Card, EmptyState, ErrorState, Heading, LoadingState, Stack, Text } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { reportsQuery } from "../../lib/queries";
import { formatDay } from "./day";

type Report = NonNullable<ReturnType<typeof useReports>["data"]>[number];
const useReports = () => useQuery(reportsQuery);

function reportLink(report: Report) {
  if (report.kind === "assessment")
    return <Link to="/assessments/$assessmentId/report" params={{ assessmentId: report.id }} />;
  if (report.kind === "roleplay") return <Link to="/roleplays/$roleplayId" params={{ roleplayId: report.id }} />;
  return <Link to="/lessons/$lessonId" params={{ lessonId: report.id }} />;
}

function ReportCard({ report, timeZone }: { report: Report; timeZone: string }) {
  return (
    <Card>
      <Stack gap={2} align="start">
        <Heading level={3} size="title">
          {report.title}
        </Heading>
        <Text tone="muted">{report.at ? formatDay(report.at, timeZone) : ""}</Text>
        <Button variant="secondary" render={reportLink(report)}>
          View report
        </Button>
      </Stack>
    </Card>
  );
}

function ReportList({ timeZone }: { timeZone: string }) {
  const reports = useReports();
  if (reports.isPending) return <LoadingState title="Loading reports" />;
  if (reports.isError)
    return <ErrorState description="Your reports couldn't be loaded." onRetry={() => reports.refetch()} />;
  if (!reports.data.length)
    return (
      <EmptyState
        icon={FileText}
        title="No reports yet"
        description="Reports appear after you finish an Assessment, Lesson or Roleplay."
      />
    );
  return reports.data.map((report) => (
    <ReportCard key={`${report.kind}-${report.id}`} report={report} timeZone={timeZone} />
  ));
}

export function Reports({ timeZone }: { timeZone: string }) {
  return (
    <Stack gap={4}>
      <Heading level={2} size="title">
        Reports
      </Heading>
      <ReportList timeZone={timeZone} />
    </Stack>
  );
}
