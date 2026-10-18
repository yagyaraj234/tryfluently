// Get Fluency's mark, Book Bloom: five petals, each an open book with a spine, in the brand colours.
const petal =
  "M-2 -10Q0 -11.5 2 -10C8 -16 16 -24 16.5 -31C17 -38 12 -42 6 -41.5C3 -41.3 1.2 -40 0 -38.5C-1.2 -40 -3 -41.3 -6 -41.5C-12 -42 -17 -38 -16.5 -31C-16 -24 -8 -16 -2 -10Z";
const fills = ["fill-brand", "fill-skill-fluency", "fill-live", "fill-skill-vocabulary", "fill-skill-grammar"];

/** The logo mark, beside the wordmark. `mono` paints the petals in the text colour, for the cobalt brand panels. */
export function LogoMark({ mono = false, className }: { mono?: boolean; className?: string }) {
  return (
    <svg aria-hidden viewBox="5 3 90 90" className={className}>
      {fills.map((fill, i) => (
        <g key={fill} transform={`translate(50 52) rotate(${i * 72})`}>
          <path d={petal} className={mono ? "fill-current" : fill} />
          <path d="M0 -38V-30" className={mono ? "stroke-brand" : "stroke-white"} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
