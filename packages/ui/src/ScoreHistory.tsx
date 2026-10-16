import { cva } from "class-variance-authority";
import type { CefrLevel } from "./SkillBar";

const table = cva("w-full text-left text-body text-ink tabular-nums");
const head = cva("pb-2 text-caption font-bold text-muted");
const row = cva("border-t-2 border-line");
const cell = cva("py-2 pr-4");

const sources = { assessment: "Assessment", lesson: "Lesson" };

export type ScoreHistoryEntry = {
  id: string;
  /** Already formatted for the Learner, for example "16 Oct 2026". */
  date: string;
  score: number;
  level: CefrLevel;
  source: keyof typeof sources;
};

export type ScoreHistoryProps = {
  /** The table's accessible name, for example "Grammar history". */
  label: string;
  /** In the order to show them. */
  entries: readonly ScoreHistoryEntry[];
};

/** How one skill's score has moved, and whether each change came from an Assessment or a Lesson. */
export function ScoreHistory({ label, entries }: ScoreHistoryProps) {
  return (
    <table aria-label={label} className={table()}>
      <thead>
        <tr>
          <th scope="col" className={head()}>Date</th>
          <th scope="col" className={head()}>Score</th>
          <th scope="col" className={head()}>From</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id} className={row()}>
            <td className={cell()}>{entry.date}</td>
            <td className={cell()}>
              {entry.score} · {entry.level}
            </td>
            <td className={cell()}>{sources[entry.source]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
