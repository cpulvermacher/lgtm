import * as jsoncParser from 'jsonc-parser';

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
        try {
            // Fallback to jsonc-parser for more tolerant parsing
            rawComments = jsoncParser.parse(jsonString);
        } catch (error) {
            console.error('Failed to parse JSON string:', error);
            return [];
        }
    }
    if (!Array.isArray(rawComments)) {
        return [];
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
