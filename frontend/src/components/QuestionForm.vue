<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'submit', question: string): void;
}>();

const questionInput = ref('');

const starterQuestions = [
  'What is the purpose of the Vehicle Signal Specification?',
  'What is the difference between a sensor, an actuator, and an attribute in VSS?',
  'How do controllers and routing decorators work in NestJS?',
  'How does dependency injection work in NestJS?',
];

const canSubmit = computed(() => !props.loading && questionInput.value.trim().length >= 3);

function handleSubmit(): void {
  const trimmed = questionInput.value.trim();
  if (trimmed.length < 3 || props.loading) {
    return;
  }
  emit('submit', trimmed);
}

function handleExampleClick(example: string): void {
  if (props.loading) {
    return;
  }
  questionInput.value = example;
  emit('submit', example);
}
</script>

<template>
  <section class="card question-card" aria-label="Ask a technical question">
    <form class="question-form" @submit.prevent="handleSubmit">
      <label class="field-label" for="question-textarea">
        Ask about COVESA Vehicle Signal Specification or NestJS
      </label>

      <div class="input-row">
        <textarea
          id="question-textarea"
          v-model="questionInput"
          class="question-textarea"
          rows="3"
          maxlength="1000"
          :disabled="loading"
          placeholder="e.g., What is the purpose of the Vehicle Signal Specification?"
          @keydown.enter.exact.prevent="handleSubmit"
        />
      </div>

      <div class="form-footer">
        <span class="input-hint">
          Press <kbd>Enter</kbd> to submit or <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line (min.
          3 characters).
        </span>
        <button type="submit" class="ask-button" :disabled="!canSubmit">
          <span v-if="loading" class="button-spinner" aria-hidden="true" />
          {{ loading ? 'Searching docs...' : 'Ask' }}
        </button>
      </div>
    </form>

    <div class="starters-section">
      <span class="starters-label">Try an example:</span>
      <div class="starters-list">
        <button
          v-for="example in starterQuestions"
          :key="example"
          type="button"
          class="starter-chip"
          :disabled="loading"
          @click="handleExampleClick(example)"
        >
          {{ example }}
        </button>
      </div>
    </div>
  </section>
</template>
