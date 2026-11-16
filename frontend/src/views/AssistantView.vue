<script setup lang="ts">
import { ref } from 'vue';
import AnswerDisplay from '../components/AnswerDisplay.vue';
import QuestionForm from '../components/QuestionForm.vue';
import SourcesList from '../components/SourcesList.vue';
import { RagApiError, askEngineeringQuestion } from '../services/rag-api';
import type { AskQuestionResponse } from '../types/rag';

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const lastQuestion = ref('');
const response = ref<AskQuestionResponse | null>(null);
const highlightedSourceNumber = ref<number | null>(null);

async function handleAsk(question: string): Promise<void> {
  loading.value = true;
  errorMessage.value = null;
  highlightedSourceNumber.value = null;
  lastQuestion.value = question;

  try {
    response.value = await askEngineeringQuestion(question);
  } catch (error: unknown) {
    response.value = null;
    if (error instanceof RagApiError) {
      errorMessage.value = error.message;
    } else if (error instanceof Error) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value = 'An unexpected error occurred while contacting the backend.';
    }
  } finally {
    loading.value = false;
  }
}

function handleSelectCitation(sourceNumber: number): void {
  highlightedSourceNumber.value = sourceNumber;
}
</script>

<template>
  <main class="page-container">
    <header class="app-header">
      <div class="brand-row">
        <span class="brand-tag">RAG Documentation Assistant</span>
      </div>
      <h1 class="app-title">EngiRAG</h1>
      <p class="app-description">
        Ask technical questions grounded strictly in indexed COVESA Vehicle Signal Specification and
        NestJS documentation, with verifiable section-level citations.
      </p>
    </header>

    <QuestionForm :loading="loading" @submit="handleAsk" />

    <section v-if="loading" class="card state-card loading-state" role="status" aria-live="polite">
      <div class="loading-spinner" aria-hidden="true" />
      <div>
        <p class="state-title">Retrieving documentation passages &amp; generating answer...</p>
        <p class="state-subtitle">
          Embedding your query locally and searching pgvector for relevant sections.
        </p>
      </div>
    </section>

    <section v-else-if="errorMessage" class="card state-card error-state" role="alert">
      <p class="state-title">Unable to complete request</p>
      <p class="state-subtitle">{{ errorMessage }}</p>
    </section>

    <template v-else-if="response">
      <AnswerDisplay
        :question="lastQuestion"
        :answer="response.answer"
        :sources="response.sources"
        @select-citation="handleSelectCitation"
      />
      <SourcesList
        :sources="response.sources"
        :highlighted-source-number="highlightedSourceNumber"
      />
    </template>

    <section v-else class="card state-card empty-state">
      <p class="state-title">Ready to search indexed engineering documentation</p>
      <p class="state-subtitle">
        Enter a question above or select one of the example prompts. Answers are constrained to
        retrieved passages and include clickable numbered citations like <code>[1]</code>,
        <code>[2]</code>.
      </p>
    </section>
  </main>
</template>
