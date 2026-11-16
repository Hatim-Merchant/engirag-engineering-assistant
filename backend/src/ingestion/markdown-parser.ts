export interface MarkdownSection {
  sectionHeading: string;
  leafHeading: string;
  headingHierarchy: string[];
  sectionAnchor: string | null;
  content: string;
}

export interface ParsedDocument {
  title: string;
  sections: MarkdownSection[];
}

interface HeadingStackEntry {
  level: number;
  text: string;
  anchor: string;
}

/**
 * Converts a Markdown heading into a deterministic URL fragment slug,
 * matching standard GitHub/Hugo anchor conventions and deduplicating repeated headings.
 */
export function generateSectionAnchor(
  headingText: string,
  seenAnchors?: Map<string, number>,
): string {
  const plainText = headingText
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .toLowerCase()
    .trim();

  const baseSlug =
    plainText
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';

  if (!seenAnchors) {
    return baseSlug;
  }

  const occurrence = seenAnchors.get(baseSlug) ?? 0;
  seenAnchors.set(baseSlug, occurrence + 1);

  return occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence}`;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .trim();
}

function parseFrontmatter(markdown: string): {
  frontmatterTitle: string | null;
  body: string;
} {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatterTitle: null, body: markdown };
  }

  const frontmatterBlock = match[1] ?? '';
  let frontmatterTitle: string | null = null;

  for (const line of frontmatterBlock.split('\n')) {
    const titleMatch = line.match(/^title:\s*(.+)$/);
    if (titleMatch?.[1]) {
      frontmatterTitle = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      break;
    }
  }

  return {
    frontmatterTitle,
    body: markdown.slice(match[0].length),
  };
}

function getFenceDelimiter(line: string): { char: '`' | '~'; length: number } | null {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  if (!match?.[1]) {
    return null;
  }

  const delimiter = match[1];
  const char = delimiter[0] === '~' ? '~' : '`';
  return { char, length: delimiter.length };
}

/**
 * Removes documentation-generator artifacts (Hugo shortcodes, decorative figures,
 * and NestJS Dgeni @@filename / JS @@switch blocks) while keeping technical text intact.
 */
export function cleanMarkdownContent(rawMarkdown: string): {
  frontmatterTitle: string | null;
  cleanedMarkdown: string;
} {
  const normalized = rawMarkdown.replace(/\r\n/g, '\n');
  const { frontmatterTitle, body } = parseFrontmatter(normalized);

  // Remove decorative <figure>...</figure> tags and Hugo notice wrapper tags.
  const withoutFigures = body
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/\{\{%\s*\/?notice[^%]*%\}\}/g, '')
    .replace(/\{\{<[^>\n]*>\}\}/g, '');

  const lines = withoutFigures.split('\n');
  const outputLines: string[] = [];

  let activeFence: { char: '`' | '~'; length: number } | null = null;
  let skippingSwitchBranch = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const fence = getFenceDelimiter(line);

    if (!activeFence && fence) {
      activeFence = fence;
      skippingSwitchBranch = false;
      outputLines.push(line);
      continue;
    }

    if (activeFence) {
      if (
        fence &&
        fence.char === activeFence.char &&
        fence.length >= activeFence.length &&
        trimmed.replace(/[`~]/g, '').length === 0
      ) {
        activeFence = null;
        skippingSwitchBranch = false;
        outputLines.push(line);
        continue;
      }

      if (/^\s*@@filename\(.*\)\s*$/.test(line)) {
        continue;
      }

      // NestJS docs separate TypeScript (before @@switch) and JavaScript (after @@switch).
      // Keeping only the primary TypeScript snippet avoids duplicate code blocks in chunks.
      if (/^\s*@@switch\s*$/.test(line)) {
        skippingSwitchBranch = true;
        continue;
      }

      if (!skippingSwitchBranch) {
        outputLines.push(line);
      }
      continue;
    }

    outputLines.push(line);
  }

  return {
    frontmatterTitle,
    cleanedMarkdown: outputLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  };
}

/**
 * Parses a Markdown document into ordered sections, tracking heading hierarchy
 * and skipping `#` comments inside fenced code blocks.
 */
export function parseMarkdownSections(rawMarkdown: string, fallbackTitle: string): ParsedDocument {
  const { frontmatterTitle, cleanedMarkdown } = cleanMarkdownContent(rawMarkdown);
  const lines = cleanedMarkdown.split('\n');

  const seenAnchors = new Map<string, number>();
  const headingStack: HeadingStackEntry[] = [];
  const sections: MarkdownSection[] = [];

  let resolvedTitle = frontmatterTitle ?? '';
  let activeFence: { char: '`' | '~'; length: number } | null = null;
  let buffer: string[] = [];
  let hasSeenHeading = false;

  const flushSection = (): void => {
    const content = buffer.join('\n').trim();
    buffer = [];

    if (!content) {
      return;
    }

    if (!hasSeenHeading || headingStack.length === 0) {
      const introTitle = resolvedTitle || fallbackTitle;
      sections.push({
        sectionHeading: introTitle,
        leafHeading: introTitle,
        headingHierarchy: [introTitle],
        sectionAnchor: null,
        content,
      });
      return;
    }

    const hierarchy = headingStack.map((entry) => entry.text);
    const leaf = headingStack[headingStack.length - 1];
    if (!leaf) {
      return;
    }

    const isRootTitleSection =
      headingStack.length === 1 &&
      (leaf.level === 1 || (!frontmatterTitle && leaf.text === resolvedTitle));

    sections.push({
      sectionHeading: hierarchy.join(' > '),
      leafHeading: leaf.text,
      headingHierarchy: hierarchy,
      sectionAnchor: isRootTitleSection ? null : leaf.anchor,
      content,
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const fence = getFenceDelimiter(line);

    if (!activeFence && fence) {
      activeFence = fence;
      buffer.push(line);
      continue;
    }

    if (activeFence) {
      buffer.push(line);
      if (
        fence &&
        fence.char === activeFence.char &&
        fence.length >= activeFence.length &&
        trimmed.replace(/[`~]/g, '').length === 0
      ) {
        activeFence = null;
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (headingMatch?.[1] && headingMatch[2]) {
      flushSection();

      const level = headingMatch[1].length;
      const headingText = stripInlineMarkdown(headingMatch[2]);

      if (!resolvedTitle) {
        resolvedTitle = headingText;
      }

      hasSeenHeading = true;

      while (headingStack.length > 0) {
        const top = headingStack[headingStack.length - 1];
        if (!top || top.level < level) {
          break;
        }
        headingStack.pop();
      }

      const anchor = generateSectionAnchor(headingText, seenAnchors);
      headingStack.push({ level, text: headingText, anchor });
      continue;
    }

    buffer.push(line);
  }

  flushSection();

  return {
    title: resolvedTitle || fallbackTitle,
    sections,
  };
}
