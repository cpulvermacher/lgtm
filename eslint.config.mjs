import eslint from "@eslint/js";
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '.vscode-test',
            'out',
            'dist',
        ]
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "import",
                format: ["camelCase", "PascalCase"],
            }],
            curly: "warn",
            eqeqeq: "warn",
            "no-throw-literal": "warn",
            "no-restricted-imports": ["warn", {
                paths: [{
                    // allowed only in extension.ts and config.ts, since it cannot be imported in unit tests.
                    name: 'vscode',
                    message: "Importing 'vscode' is restricted except for type imports.",
                    // TODO only restricts default import, so model.ts is already broken
                    importNames: ['default'],
                }],
            }]
        },
    })
