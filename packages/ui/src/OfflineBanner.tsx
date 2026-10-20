import { WifiSlash } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";

const banner = cva(
  "sticky top-0 z-sticky flex items-center justify-center gap-2 border-b border-line bg-paper px-4 py-2 text-caption font-bold text-ink",
);

export function OfflineBanner() {
  return (
    <div role="status" className={banner()}>
      <WifiSlash aria-hidden />
      You're offline. Some things won't load until you're back online.
    </div>
  );
}
