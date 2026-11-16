<script setup lang="ts">
import { computed } from 'vue';
import { parseAnswerSegments } from '../services/rag-api';
import type { CitationSource } from '../types/rag';

const props = defineProps<{
  question: string;
  answer: string;
  sources: CitationSource[];
}>();

const emit = defineEmits<{
  (e: 'selectCitation', sourceNumber: number): void;
}>();

const segments = computed(() => parseAnswerSegments(props.answer, props.sources));

const citedSources = computed(() => {
  const referencedNumbers = new Set<number>();
  for (const segment of segments.value) {
    if (segment.type === 'citation') {
      referencedNumbers.add(segment.number);
    }
  }
  return props.sources.filter((source) => referencedNumbers.has(source.number));
});
</script>

<template>
  <article class="card answer-card" aria-live="polite">
    <div class="answer-header">
      <span class="badge badge-primary">Grounded Answer</span>
      <p class="asked-question">{{ question }}</p>
    </div>

    <div class="answer-body">
      <template v-for="(segment, index) in segments" :key="index">
        <span v-if="segment.type === 'text'" class="answer-text">{{ segment.text }}</span>
        <a
          v-else-if="segment.source"
          class="citation-badge"
          :href="segment.source.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="`${segment.source.title} – ${segment.source.section}`"
          @click="emit('selectCitation', segment.number)"
        >
          [{{ segment.number }}]
        </a>
      </template>
    </div>

    <div v-if="citedSources.length > 0" class="answer-citations-summary">
      <span class="citations-heading">Cited documentation:</span>
      <ul class="citations-inline-list">
        <li v-for="source in citedSources" :key="source.number">
          <a
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="citation-summary-link"
            @click="emit('selectCitation', source.number)"
          >
            [{{ source.number }}] {{ source.title }} — {{ source.section }}
          </a>
        </li>
      </ul>
    </div>
  </article>
</template>
