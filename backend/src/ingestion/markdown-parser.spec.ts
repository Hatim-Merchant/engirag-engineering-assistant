import {
  cleanMarkdownContent,
  generateSectionAnchor,
  parseMarkdownSections,
} from './markdown-parser';

describe('markdown-parser', () => {
  describe('generateSectionAnchor', () => {
    it('strips inline markdown and converts headings to URL slugs', () => {
      expect(generateSectionAnchor('What is **VSS** (`vspec`)?')).toBe('what-is-vss-vspec');
      expect(generateSectionAnchor('See [Data Types](https://example.com) Overview')).toBe(
        'see-data-types-overview',
      );
    });

    it('disambiguates duplicate headings within the same document', () => {
      const seen = new Map<string, number>();

      expect(generateSectionAnchor('Overview', seen)).toBe('overview');
      expect(generateSectionAnchor('Overview', seen)).toBe('overview-1');
      expect(generateSectionAnchor('Overview', seen)).toBe('overview-2');
    });
  });

  describe('cleanMarkdownContent', () => {
    it('extracts YAML frontmatter title and strips Hugo notice wrappers', () => {
      const raw = `---
title: "Overview"
weight: 1
---

{{% notice warning %}}
Important warning text.
{{% /notice %}}

Main body text.`;

      const result = cleanMarkdownContent(raw);

      expect(result.frontmatterTitle).toBe('Overview');
      expect(result.cleanedMarkdown).toContain('Important warning text.');
      expect(result.cleanedMarkdown).toContain('Main body text.');
      expect(result.cleanedMarkdown).not.toContain('{{% notice');
    });

    it('removes Dgeni @@filename markers and JavaScript @@switch duplicates', () => {
      const raw = `### Controllers

\`\`\`typescript
@@filename(cats.controller)
import { Controller } from '@nestjs/common';

@Controller('cats')
export class CatsController {}
@@switch
import { Controller } from '@nestjs/common';

@Controller('cats')
export class CatsControllerJs {}
\`\`\``;

      const result = cleanMarkdownContent(raw);

      expect(result.cleanedMarkdown).toContain('export class CatsController {}');
      expect(result.cleanedMarkdown).not.toContain('@@filename');
      expect(result.cleanedMarkdown).not.toContain('@@switch');
      expect(result.cleanedMarkdown).not.toContain('CatsControllerJs');
    });
  });

  describe('parseMarkdownSections', () => {
    it('tracks heading hierarchy and ignores # comments inside fenced code blocks', () => {
      const raw = `---
title: "Rule Set Basics"
---

## File Syntax

VSS uses YAML files.

\`\`\`yaml
# This comment inside YAML must NOT be parsed as a heading
Vehicle.Speed:
  type: sensor
\`\`\`

### Node Naming

Use CamelCase for node names.

## Branches

Branches organize signals into a tree.`;

      const parsed = parseMarkdownSections(raw, 'Fallback');

      expect(parsed.title).toBe('Rule Set Basics');
      expect(parsed.sections).toHaveLength(3);

      expect(parsed.sections[0]).toMatchObject({
        sectionHeading: 'File Syntax',
        leafHeading: 'File Syntax',
        headingHierarchy: ['File Syntax'],
        sectionAnchor: 'file-syntax',
      });
      expect(parsed.sections[0]?.content).toContain('# This comment inside YAML');

      expect(parsed.sections[1]).toMatchObject({
        sectionHeading: 'File Syntax > Node Naming',
        leafHeading: 'Node Naming',
        headingHierarchy: ['File Syntax', 'Node Naming'],
        sectionAnchor: 'node-naming',
      });

      expect(parsed.sections[2]).toMatchObject({
        sectionHeading: 'Branches',
        leafHeading: 'Branches',
        headingHierarchy: ['Branches'],
        sectionAnchor: 'branches',
      });
    });

    it('sets sectionAnchor to null for the top-level document title section', () => {
      const raw = `### Controllers

Controllers handle incoming HTTP requests.

#### Routing

Use the @Controller decorator to group routes.`;

      const parsed = parseMarkdownSections(raw, 'Controllers Fallback');

      expect(parsed.title).toBe('Controllers');
      expect(parsed.sections[0]?.sectionAnchor).toBeNull();
      expect(parsed.sections[1]?.sectionHeading).toBe('Controllers > Routing');
      expect(parsed.sections[1]?.sectionAnchor).toBe('routing');
    });
  });
});
