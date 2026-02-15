/**
 * Parse a wiki-link string like "[[Some-Name]]" into the plain name "Some-Name".
 * Returns the input unchanged if it doesn't match the wiki-link pattern.
 */
export function parseWikiLink(raw: string): string {
  const match = raw.match(/^\[\[(.+)\]\]$/);
  return match ? match[1] : raw;
}

/**
 * Convert a display name to the project's filename slug format.
 * "Atomic Heart" → "Atomic-Heart"
 */
export function toSlug(name: string): string {
  return name.trim().replace(/\s+/g, "-");
}

/**
 * Extract the slug from a markdown filename.
 * "lib/games/Atomic-Heart.md" → "Atomic-Heart"
 */
export function slugFromPath(filePath: string): string {
  const filename = filePath.split("/").pop() ?? filePath;
  return filename.replace(/\.md$/, "");
}
