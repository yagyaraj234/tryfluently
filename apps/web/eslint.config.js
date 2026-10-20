import appRules from "@fluently/ui/eslint";

export default [...appRules, { ignores: ["src/routeTree.gen.ts", "dist/**", ".output/**"] }];
