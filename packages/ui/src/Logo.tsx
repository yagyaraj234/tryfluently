import { useId } from "react";

const body =
  "M78.7 58L77.7 59.9L76.7 61.8L75.8 63.5L75 65.2L74.4 66.9L73.9 68.6L73.6 70.5L73.2 72.5L72.8 74.6L72.2 76.6L71.3 78.6L70.1 80.4L68.6 81.8L66.8 83L64.8 83.7L62.7 84L60.5 84.1L58.4 83.8L56.4 83.5L54.4 83.1L52.6 82.8L50.9 82.8L49.1 82.9L47.3 83.2L45.5 83.8L43.4 84.4L41.3 84.9L39 85.3L36.7 85.4L34.4 85L32.3 84.2L30.5 83L29 81.3L27.9 79.3L27.2 77.1L26.8 74.8L26.6 72.6L26.6 70.5L26.5 68.5L26.2 66.6L25.9 64.9L25.3 63.3L24.5 61.6L23.6 59.8L22.7 58L21.9 56L21.4 54L21.1 51.9L21.3 49.8L21.9 47.8L22.9 45.9L24.2 44.3L25.8 42.9L27.5 41.7L29.3 40.6L31.1 39.7L32.7 38.8L34.2 37.8L35.6 36.6L36.9 35.3L38.2 33.8L39.6 32.2L41.1 30.6L42.8 29.1L44.7 27.9L46.7 27L48.9 26.7L51.1 26.8L53.2 27.5L55.2 28.6L57 30L58.6 31.7L60 33.3L61.2 35L62.5 36.4L63.7 37.7L65.1 38.7L66.6 39.6L68.3 40.3L70.2 41.1L72.1 41.9L74.1 42.9L76 44.2L77.6 45.7L78.9 47.5L79.7 49.5L80.1 51.6L80 53.8L79.5 55.9Z";
const cap = "M50 12L78 22L50 32L22 22Z";

export function LogoMark({ className }: { className?: string }) {
  const cut = useId();
  return (
    <svg aria-hidden viewBox="11 8 78 78" fill="currentColor" className={className}>
      <mask id={cut}>
        <rect x="0" y="0" width="100" height="100" fill="#fff" />
        <ellipse cx="43.5" cy="58" rx="2.6" ry="3.4" fill="#000" />
        <ellipse cx="56.5" cy="58" rx="2.6" ry="3.4" fill="#000" />
        <path d="M45.5 66Q50 70 54.5 66" fill="none" stroke="#000" strokeWidth={2.3} strokeLinecap="round" />
        <path d={cap} fill="#000" stroke="#000" strokeWidth={4} strokeLinejoin="round" />
      </mask>
      <path d={body} mask={`url(#${cut})`} />
      <path d={cap} />
      <path
        d="M50 22L72 28V38"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="72" cy="40" r="3.2" />
    </svg>
  );
}
