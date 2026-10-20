import { cva } from "class-variance-authority";
import type { CefrLevel } from "./SkillBar";

const table = cva("w-full text-left text-body text-ink tabular-nums");
const head = cva("pb-2 text-caption font-medium text-muted");
const row = cva("border-t border-line");
const cell = cva("py-2 pr-4");

const sources = { assessment: "Assessment", lesson: "Lesson" };

export type ScoreHistoryEntry = {
  id: string;
  date: string;
  score: number;
  level: CefrLevel;
  source: keyof typeof sources;
};

export type ScoreHistoryProps = {
  label: string;
  entries: readonly ScoreHistoryEntry[];
};

const columns = ["Date", "Score", "From"];

function ScoreRow({ entry }: { entry: ScoreHistoryEntry }) {
  return (
    <tr className={row()}>
      <td className={cell()}>{entry.date}</td>
      <td className={cell()}>
        {entry.score} · {entry.level}
      </td>
      <td className={cell()}>{sources[entry.source]}</td>
    </tr>
  );
}

export function ScoreHistory({ label, entries }: ScoreHistoryProps) {
  return (
    <table aria-label={label} className={table()}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col" className={head()}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <ScoreRow key={entry.id} entry={entry} />
        ))}
      </tbody>
    </table>
  );
}
