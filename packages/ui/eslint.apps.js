// The styling boundary for apps: they assemble screens from @fluently/ui and never style anything.
// Adopt it with one line in the app's eslint.config.js: `export { default } from "@fluently/ui/eslint";`
import babelParser from "@babel/eslint-parser";

/**
 * Parses TS and TSX syntax with Babel. typescript-eslint needs the TypeScript 6 API, which the repo's
 * TypeScript 7 doesn't ship. JSX is on in `.ts` files too, so `<T>value` casts don't parse: use `as`.
 * @type {import("eslint").Linter.Config}
 */
export const typescriptSyntax = {
  files: ["**/*.{ts,tsx,mts,cts}"],
  languageOptions: {
    parser: babelParser,
    parserOptions: {
      requireConfigFile: false,
      babelOptions: { babelrc: false, configFile: false, parserOpts: { plugins: ["typescript", "jsx"] } },
    },
  },
};

/** @type {import("eslint").Linter.Config[]} */
export default [
  typescriptSyntax,
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name=/^(className|style)$/]",
          message: "Apps don't style anything. Use a @fluently/ui component, or add the variant there.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!@fluently/ui/styles\\.css(\\?|$)).*\\.css(\\?|$)",
              message: "Apps have no CSS. The only stylesheet is @fluently/ui/styles.css.",
            },
          ],
        },
      ],
    },
  },
];
