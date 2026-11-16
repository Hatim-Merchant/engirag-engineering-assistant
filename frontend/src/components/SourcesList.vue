<script setup lang="ts">
import { ref, watch } from 'vue';
import type { CitationSource } from '../types/rag';

const props = defineProps<{
  sources: CitationSource[];
  highlightedSourceNumber: number | null;
}>();

const isExpanded = ref(false);

watch(
  () => props.highlightedSourceNumber,
  (selected) => {
    if (selected !== null) {
      isExpanded.value = true;
    }
  },
);

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
}
</script>

<template>
  <section v-if="sources.length > 0" class="card sources-card" aria-label="Retrieved sources">
    <div class="sources-header">
      <div>
        <h2 class="sources-title">Retrieved Documentation Passages ({{ sources.length }})</h2>
        <p class="sources-subtitle">
          Verify the answer against the exact passages retrieved from PostgreSQL pgvector.
        </p>
      </div>

      <button
        type="button"
        class="toggle-sources-button"
        :aria-expanded="isExpanded"
        aria-controls="retrieved-sources-panel"
        @click="toggleExpanded"
      >
        {{ isExpanded ? 'Hide retrieved passages' : 'Show retrieved passages' }}
      </button>
    </div>

    <div v-if="isExpanded" id="retrieved-sources-panel" class="sources-list">
      <article
        v-for="source in sources"
        :key="source.number"
        :class="[
          'source-item',
          { 'source-item-highlighted': highlightedSourceNumber === source.number },
        ]"
      >
        <div class="source-item-top">
          <div class="source-meta">
            <span class="source-number">[{{ source.number }}]</span>
            <div>
              <h3 class="source-doc-title">{{ source.title }}</h3>
              <p class="source-section-name">{{ source.section }}</p>
            </div>
          </div>

          <span class="score-pill" title="Cosine similarity score">
            Similarity: {{ source.score.toFixed(4) }}
          </span>
        </div>

        <blockquote class="source-excerpt">{{ source.excerpt }}</blockquote>

        <div class="source-item-footer">
          <a
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="source-external-link"
          >
            Open original documentation ↗
          </a>
        </div>
      </article>
    </div>
  </section>
</template>
