import { Injectable } from '@nestjs/common';

const FETCH_TIMEOUT_MS = 15_000;

@Injectable()
export class DocumentFetcher {
  /**
   * Downloads a single raw Markdown file over HTTPS with an explicit timeout
   * so stalled remote requests do not hang the ingestion CLI.
   */
  async fetchMarkdown(rawUrl: string): Promise<string> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(rawUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'text/plain, text/markdown',
          'User-Agent': 'EngiRAG-Ingestion-CLI/0.1',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} while fetching ${rawUrl}`);
      }

      const content = await response.text();
      if (!content.trim()) {
        throw new Error(`Fetched empty Markdown document from ${rawUrl}`);
      }

      return content;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms fetching ${rawUrl}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
