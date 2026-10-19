import { Lightning } from "@phosphor-icons/react";
import { Chip } from "./Chip";
import { chipNumber } from "./StreakChip";

export type XpChipProps = {
  xp: number;
};

/** The Learner's XP in the app chrome. */
export function XpChip({ xp }: XpChipProps) {
  return (
    <Chip tone="soft">
      <Lightning aria-hidden weight="fill" className="text-skill-fluency" />
      <span className={chipNumber()}>{xp}</span> XP
    </Chip>
  );
}
