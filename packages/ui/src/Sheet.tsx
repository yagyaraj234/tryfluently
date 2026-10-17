import { type DialogProps, Overlay } from "./Dialog";

export type SheetProps = DialogProps;

/** A Dialog that comes up from the bottom edge below `desktop`, and sits centred like a Dialog at it. */
export function Sheet(props: SheetProps) {
  return <Overlay kind="sheet" {...props} />;
}
