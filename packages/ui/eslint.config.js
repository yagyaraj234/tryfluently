// Lint for the ui package itself: only token classes, and nothing that belongs to an app.
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { typescriptSyntax } from "./eslint.apps.js";

// Any variants (`lg:hover:`), then an optional important or negative prefix (`!`, `-`).
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
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              // Arbitrary values are fine for one-off layout, but a colour is always a theme token.
              pattern: "\\[[^\\]]*(#[0-9a-fA-F]{3,8}|(?<![a-zA-Z])(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\\()",
              message: "Colours are tokens: use a theme colour (bg-paper, var(--color-ink)) instead of a raw value.",
            },
            {
              // Tailwind still compiles any number here; only the named tokens are allowed.
              pattern: `${UTILITY}(duration|z)-\\d+!?$`,
              message: "Use a token: duration-press, duration-ui, z-behind, z-sticky, z-overlay or z-toast.",
            },
            {
              // Hairlines are 1px (`border`); 2px is for emphasis. Nothing thicker.
              pattern: `${UTILITY}(border(-[xytrblse])?|divide-[xy])-(?!(0|2)!?$)\\d+!?$`,
              message: "Borders are 1px (border) or 2px (border-2).",
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
                "@fluently/api",
                "@fluently/db",
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
