import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma's generated client. Linting it produced 780 of the 799 problems this
    // command reported, which drowned the handful of real ones in our own code and made
    // `npm run lint` useless as a gate. It is machine-written and never edited by hand.
    "src/generated/**",
  ]),
  {
    rules: {
      // A leading underscore is the project's existing signal for "destructured on
      // purpose, deliberately unused" — see the margin fields in domain/upsell/recommend.
      // Without this the convention reads as an error rather than as intent.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
