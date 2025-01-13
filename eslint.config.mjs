import eslint from '@eslint/js';
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
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['src/test/unit/*/*.ts', 'eslint.config.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
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
                    // imports from 'vscode' allowed only in src/vscode, since we cannot import it in unit tests
                    name: 'vscode',
                    message: "Importing 'vscode' is restricted except for type imports.",
                    importNames: ['default'],
                }],
            }]
        },
    },
    {
        files: ["src/test/unit/**/*.ts"],
        rules: {
            "@typescript-eslint/unbound-method": "off"
        }
    }
)
