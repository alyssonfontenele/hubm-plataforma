import DOMPurify from "dompurify";

/**
 * Strip ALL HTML — safe for plain text fields persisted to the database
 * (names, titles, descriptions, etc.). Prevents XSS by removing every tag
 * and attribute. Returns plain text.
 */
export const sanitize = (input: string): string =>
  DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

/**
 * Sanitize HTML, keeping a safe subset of tags. Use ONLY when rendering
 * user-supplied HTML intentionally (e.g. inside dangerouslySetInnerHTML).
 */
export const sanitizeHtml = (input: string): string => DOMPurify.sanitize(input);
