const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");
const nextPlugin = require("@next/eslint-plugin-next");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const jsxA11yPlugin = require("eslint-plugin-jsx-a11y");
const importPlugin = require("eslint-plugin-import");

module.exports = tseslint.config(
  // Base configuration
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Global ignores
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
      ".turbo/**",
      "next-env.d.ts",
      "**/*.snap",
      "**/*.snapshot",
    ],
  },

  // Base configuration for all files
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        React: "readonly",
      },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "@next/next": nextPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
      import: importPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
        node: true,
      },
    },
  },

  // TypeScript files configuration
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Next.js rules
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // React rules
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSTypeReference[typeName.name='number']:has(TSPropertySignature[key.name=/Id$/])",
          message: "Use SafeBigInt for ID fields instead of number",
        },
        {
          selector:
            "TSTypeReference[typeName.name='number']:has(TSPropertySignature[key.name=/.*[Cc]ount$/])",
          message: "Use SafeBigInt for count fields instead of number",
        },
        {
          selector:
            "TSTypeReference[typeName.name='number']:has(TSPropertySignature[key.name=/.*[Ss]ize$/])",
          message: "Use SafeBigInt for size fields instead of number",
        },
      ],
    },
  },

  // Test files configuration
  {
    files: ["**/__tests__/**/*", "**/*.test.*", "**/*.spec.*", "**/tests/**/*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
    },
  },

  // JavaScript files configuration
  {
    files: ["*.js", "*.mjs", "*.cjs"],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },

  // Generated files configuration
  {
    files: ["src/lib/api-client/models/**/*", "src/lib/types/generated/**/*"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSPropertySignature[key.name=/.*[Ii]d$/][typeAnnotation.typeAnnotation.type='TSNumberKeyword']",
          message:
            "Generated models must use SafeBigInt for ID fields, not number. Check contract sync pipeline.",
        },
      ],
    },
  },
);
