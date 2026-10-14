// @ts-check

import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import eslintPluginImport from "eslint-plugin-import-x";
import eslintPluginSolid from "eslint-plugin-solid";
import eslintPluginSonar from "eslint-plugin-sonarjs";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintPluginUnusedImports from "eslint-plugin-unused-imports";
import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const MAX_PARENT_DEPTH = 8;
// minimatch's `**` never matches `.`/`..` segments, so each relative prefix is
// spelled out.
const GENERATED_IMPORT_PREFIXES = [
  "./",
  ...Array.from({ length: MAX_PARENT_DEPTH }, (_, i) => "../".repeat(i + 1)),
];

export default tseslint.config(
  globalIgnores([
    "**/dist/**",
    "**/eslint.config.js",
    "**/stylelint.config.js",
    "**/vite.config.ts",
    "**/*.d.ts",
    "*.css",
  ]),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        global: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "writable",
        require: "readonly",
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    plugins: {
      "import-x": eslintPluginImport,
    },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
    },
    rules: {
      "import-x/no-default-export": "warn",
      // Extensionless imports make the bundler probe `.ts` before `.tsx`. On a
      // case-insensitive filesystem (macOS, Windows) `./WhatsNew` then matches
      // `whatsNew.ts` and loads the wrong module.
      "import-x/extensions": [
        "error",
        "always",
        {
          ignorePackages: true,
          checkTypeImports: true,
          fix: true,
          // Convex codegen output: fixed names, no case clash, and the resolver
          // lands on the `.d.ts`, so the fix cannot pick an extension.
          pathGroupOverrides: GENERATED_IMPORT_PREFIXES.map((prefix) => ({
            pattern: `${prefix}**/_generated/*`,
            action: "ignore",
          })),
        },
      ],
      // The extensions fix turns a folder import (`./routing`) into
      // `./routing.tsx` instead of `./routing/index.tsx`; this catches it.
      "import-x/no-unresolved": ["error", { ignore: ["^virtual:"] }],
      "import-x/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='toUpperCase']",
          message:
            "Avoid .toUpperCase() for UI text; use 'text-transform: uppercase' in the CSS module file instead. If this is purely for business logic, you can disable this rule (eslint-disable-next-line no-restricted-syntax).",
        },
        {
          selector: "CallExpression[callee.property.name='toLowerCase']",
          message:
            "Avoid .toLowerCase() for UI text; use 'text-transform: lowercase' in the CSS module file instead. If this is purely for business logic, you can disable this rule (eslint-disable-next-line no-restricted-syntax).",
        },
      ],
      "no-implicit-coercion": ["warn", { allow: ["!!"] }],
    },
  },

  {
    plugins: {
      "eslint-comments": eslintComments,
    },
    rules: {
      "eslint-comments/no-unlimited-disable": "off",
      "eslint-comments/disable-enable-pair": ["warn", { allowWholeFile: true }],
      "eslint-comments/require-description": "warn",
    },
  },

  {
    plugins: {
      solid: eslintPluginSolid,
    },
    rules: {
      ...eslintPluginSolid.configs.typescript.rules,
      "solid/prefer-show": "warn",
    },
  },

  {
    plugins: {
      "unused-imports": eslintPluginUnusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "warn",
    },
  },

  {
    rules: {
      "no-console": "warn",
      "no-redeclare": "off",
      "func-style": ["warn", "declaration", { allowArrowFunctions: false }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
      "@typescript-eslint/no-redeclare": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unnecessary-type-arguments": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      // stylisticTypeChecked turns this on. Noop arrow defaults
      // (`onChange = () => {}`) are an idiomatic Solid pattern, so allow them;
      // empty named functions/methods still flag (genuine "forgot to implement").
      "@typescript-eslint/no-empty-function": [
        "error",
        { allow: ["arrowFunctions"] },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "warn",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/restrict-plus-operands": [
        "warn",
        { allowBoolean: true, allowNumberAndString: true },
      ],
    },
  },

  eslintPluginSonar.configs.recommended,
  {
    rules: {
      // Solid props are read-only proxies already; Readonly<> adds noise.
      "sonarjs/prefer-read-only-props": "off",
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-lines-per-function": [
        "error",
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      "max-lines": [
        "error",
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", 4],
      "no-nested-ternary": "error",
      eqeqeq: "error",
      "id-length": [
        "error",
        { min: 2, properties: "never", exceptions: ["_", "x", "y"] },
      ],
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [0, 1, -1, 2],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          enforceConst: true,
          ignoreNumericLiteralTypes: true,
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
    },
  },
  {
    plugins: { unicorn: eslintPluginUnicorn },
    rules: {
      "unicorn/prefer-combined-guards": "error",
      "unicorn/no-array-callback-reference": "error",
      "unicorn/prefer-string-replace-all": "error",
      "unicorn/consistent-function-scoping": "error",
      "unicorn/no-negated-condition": "error",
      "unicorn/no-useless-undefined": "error",
      "unicorn/no-unreadable-for-of-expression": "error",
      "unicorn/prefer-early-return": "error",
      "unicorn/no-declarations-before-early-exit": "error",
      "unicorn/no-break-in-nested-loop": "error",
      "unicorn/no-await-expression-member": "error",
      "unicorn/prefer-ternary": "error",
      // Boolean variables need an is/has/can… prefix. Functions that return a
      // boolean keep verb names (`sendEmail`, `passesRecaptcha`); only a
      // non-boolean function wearing a boolean prefix is flagged. `confirm`
      // holds the `useConfirm()` prompt function, whose Promise<boolean>
      // result the rule misreads as a boolean value.
      "unicorn/consistent-boolean-name": [
        "error",
        { checkFunctions: "prohibit", ignore: ["^confirm$"] },
      ],
      "unicorn/name-replacements": [
        "error",
        {
          checkProperties: false,
          // File names are not checked: under convex/ a file name is an API
          // path (`api.applications.*`, `bunx convex run dev:*`), and
          // component files mirror their component name.
          checkFilenames: false,
          replacements: {
            props: false,
            args: false,
            params: false,
            err: false,
            prev: false,
            deps: false,
            doc: false,
            // unicorn maps these full words to their abbreviations.
            application: false,
            applications: false,
            configuration: false,
          },
          allowList: {
            Doc: true,
            QueryCtx: true,
            MutationCtx: true,
            ActionCtx: true,
          },
        },
      ],
    },
  },

  {
    // Test files mock observer APIs (ResizeObserver/IntersectionObserver) with
    // empty observe/unobserve/disconnect methods — legitimately empty.
    files: [
      "**/*.test.{ts,tsx}",
      "**/vitest.setup.{ts,tsx}",
      "**/test/**",
      "**/test-stubs/**",
    ],
    rules: {
      "@typescript-eslint/no-empty-function": [
        "error",
        { allow: ["arrowFunctions", "methods"] },
      ],
      "@typescript-eslint/no-magic-numbers": "off",
      "max-lines-per-function": "off",
      "max-lines": "off",
      complexity: "off",
      "sonarjs/cognitive-complexity": "off",
      "max-params": "off",
    },
  },

  {
    // Convex framework entry files MUST default-export (the schema, http router,
    // cron registry, app config and auth config are loaded by Convex via their
    // default export).
    files: [
      "**/convex/schema.ts",
      "**/convex/http.ts",
      "**/convex/crons.ts",
      "**/convex/convex.config.ts",
      "**/convex/auth.config.ts",
    ],
    rules: {
      "import-x/no-default-export": "off",
    },
  },
);
