// esbuild by default uses the UMD build, which will miss some dependencies, see https://github.com/microsoft/node-jsonc-parser/issues/57
import * as jsoncParser from 'jsonc-parser/lib/esm/main.js';

/** Parse JSON string from model into array */
export function parseAsJsonArray(response: string): unknown[] {
    const jsonString = extractJsonString(response);
    if (!jsonString) {
        return [];
    }

    let rawComments: unknown;
    try {
        // Try standard JSON parsing first (faster)
        rawComments = JSON.parse(jsonString);
    } catch {
        console.warn(
            'LGTM: Failed to parse JSON, falling back to jsonc-parser for more tolerant parsing'
        );
        // Fallback to jsonc-parser for more tolerant parsing
        rawComments = jsoncParser.parse(jsonString);
    }
    if (!Array.isArray(rawComments)) {
        throw new Error(
            `Expected an array of comments, got type: ${typeof rawComments}`
        );
    }
    return rawComments;
}

/** remove additional text before parsing (most responses are wrapped in markup code blocks) */
function extractJsonString(response: string): string | null {
    const start = response.indexOf('[');
    const end = response.lastIndexOf(']');
    if (start === -1 || end === -1) {
        return null;
    }
    return response.slice(start, end + 1);
}
