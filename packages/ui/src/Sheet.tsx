import { type DialogProps, Overlay } from "./Dialog";

export type SheetProps = DialogProps;

export function Sheet(props: SheetProps) {
  return <Overlay kind="sheet" {...props} />;
}
