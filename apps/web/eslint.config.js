import appRules from "@impromptu/ui/eslint";

export default [...appRules, { ignores: ["src/routeTree.gen.ts", "dist/**", ".output/**"] }];
