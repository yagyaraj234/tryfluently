// Lint for the ui package itself: only token classes, and nothing that belongs to an app.
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { typescriptSyntax } from "./eslint.apps.js";

// Any variants (`desktop:hover:`), then an optional important or negative prefix (`!`, `-`).
const UTILITY = "^([^:]*:)*!?-?";

const SIDE_EFFECTS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "RTCPeerConnection",
  "MediaRecorder",
  "localStorage",
  "sessionStorage",
  "indexedDB",
];
const SIDE_EFFECTS_MESSAGE =
  "Side effects and storage live in apps. Take data as props and report events through callbacks.";

export default [
  typescriptSyntax,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: { "better-tailwindcss": { entryPoint: `${import.meta.dirname}/src/styles.css` } },
    rules: {
      // The surfaces are plain classes from tokens.css, not Tailwind utilities.
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: ["^surface-(loud|quiet)$"] }],
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              // Arbitrary values. Base UI's documented variables are the only exception.
              pattern:
                "\\[|\\]|\\((?!--(anchor-width|anchor-height|available-width|available-height|transform-origin)\\))",
              message: "Arbitrary values aren't tokens. Add a token to tokens.css and styles.css instead.",
            },
            {
              pattern: "/\\d+!?$",
              message: "No opacity suffixes. Tints are opaque tokens (for example bg-correct-tint).",
            },
            {
              // Tailwind still compiles any number here; only the named tokens are allowed.
              pattern: `${UTILITY}(duration|z)-\\d+!?$`,
              message: "Use a token: duration-press, duration-ui, z-sticky, z-overlay or z-toast.",
            },
            {
              // Any border width other than 2, on any side (`border`, `border-t`, `border-3`, `divide-x`, ...).
              pattern: `${UTILITY}(border(-[xytrblse])?|divide-[xy])(-(?!2!?$)\\d+)?!?$`,
              message: "Borders are always 2px: use border-2 (or border-t-2, divide-x-2 and so on).",
            },
          ],
        },
      ],
      // Purely presentational: no routes, data or app state, so any app can reuse it.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@tanstack/*",
                "@impromptu/api",
                "@impromptu/db",
                "react-router",
                "react-router-dom",
                "swr",
                "@apollo/client",
                "urql",
                "zustand",
                "jotai",
                "valtio",
                "redux",
                "react-redux",
                "@reduxjs/*",
                "mobx",
                "mobx-react*",
                "xstate",
                "@xstate/*",
              ],
              message: "The ui package knows nothing about routes, data or app state. Take it as props instead.",
            },
          ],
        },
      ],
      "no-restricted-globals": ["error", ...SIDE_EFFECTS.map((name) => ({ name, message: SIDE_EFFECTS_MESSAGE }))],
      // The same globals reached through `window.`, `globalThis.` or `self.`.
      "no-restricted-syntax": [
        "error",
        {
          selector: `MemberExpression[object.name=/^(window|globalThis|self)$/][property.name=/^(${SIDE_EFFECTS.join("|")})$/]`,
          message: SIDE_EFFECTS_MESSAGE,
        },
      ],
    },
  },
];
