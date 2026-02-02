/**
 * Normalize a comment for comparison (lowercase, trim, remove extra whitespace).
 * Used for deduplicating similar comments from multiple models.
 * @param comment The comment text to normalize
 * @returns Normalized comment string (max 500 chars to balance accuracy vs performance)
 */
export function normalizeComment(comment: string): string {
    return comment.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 500);
}
