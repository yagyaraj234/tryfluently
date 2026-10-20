import { Lightning } from "@phosphor-icons/react";
import { Chip } from "./Chip";
import { chipNumber } from "./StreakChip";

export type XpChipProps = {
  xp: number;
};

export function XpChip({ xp }: XpChipProps) {
  return (
    <Chip>
      <Lightning aria-hidden weight="fill" size={16} className="text-primary" />
      <span className={chipNumber()}>{xp}</span> XP
    </Chip>
  );
}
