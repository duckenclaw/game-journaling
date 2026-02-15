import fs from "node:fs";
import matter from "gray-matter";

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  sections: Record<string, string>;
  rawContent: string;
}

/**
 * Parse a markdown file's YAML frontmatter and split body content into named sections
 * based on markdown headings (e.g., "# Gameplay", "## Notes").
 */
export function parseMarkdownFile(filePath: string): ParsedMarkdown {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  const sections = splitContentSections(content);

  return {
    frontmatter: data as Record<string, unknown>,
    sections,
    rawContent: content,
  };
}

/**
 * Split markdown content into sections by heading.
 * "# Gameplay" → { gameplay: "..." }
 * "## Notes" → { notes: "..." }
 */
function splitContentSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = /^#{1,3}\s+(.+)$/gm;

  const headings: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      name: match[1].trim().toLowerCase(),
      index: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index - (content.slice(0, headings[i + 1].index).match(/#{1,3}\s+.+$/m)?.[0]?.length ?? 0) : content.length;

    const sectionContent = content.slice(start, end).trim();
    if (sectionContent) {
      sections[headings[i].name] = sectionContent;
    }
  }

  return sections;
}
