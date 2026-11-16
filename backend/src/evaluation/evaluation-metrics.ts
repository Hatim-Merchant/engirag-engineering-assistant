export interface EvaluationQuestion {
  id: string;
  question: string;
  expectedSource: string | string[];
  expectedSection?: string;
}

export interface RetrievedSourceCandidate {
  externalId: string;
  sectionHeading: string;
  score: number;
}

export interface QuestionRetrievalOutcome {
  questionId: string;
  question: string;
  expectedSources: string[];
  expectedSection?: string;
  retrievedSources: RetrievedSourceCandidate[];
  firstRelevantRank: number | null;
  firstSectionMatchRank: number | null;
}

export interface AggregatedMetrics {
  k: number;
  totalQuestions: number;
  hitsAtK: number;
  hitRateAtK: number;
  mrrAtK: number;
  questionsWithExpectedSection: number;
  sectionHitsAtK: number;
  sectionHitRateAtK: number | null;
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function normalizeExpectedSources(expectedSource: string | readonly string[]): string[] {
  return typeof expectedSource === 'string' ? [expectedSource] : [...expectedSource];
}

/**
 * Finds the 1-based rank of the first retrieved chunk matching any expected source page,
 * and (if specified) the first chunk matching both expected source page and expected section.
 */
export function evaluateQuestionOutcome(
  question: EvaluationQuestion,
  retrievedSources: readonly RetrievedSourceCandidate[],
): QuestionRetrievalOutcome {
  const expectedSources = normalizeExpectedSources(question.expectedSource);
  const expectedSet = new Set(expectedSources);
  const expectedSectionLower = question.expectedSection?.toLowerCase();

  let firstRelevantRank: number | null = null;
  let firstSectionMatchRank: number | null = null;

  for (let i = 0; i < retrievedSources.length; i += 1) {
    const candidate = retrievedSources[i];
    if (!candidate) {
      continue;
    }

    const rank = i + 1;
    const sourceMatches = expectedSet.has(candidate.externalId);
    if (!sourceMatches) {
      continue;
    }

    if (firstRelevantRank === null) {
      firstRelevantRank = rank;
    }

    if (
      expectedSectionLower &&
      firstSectionMatchRank === null &&
      candidate.sectionHeading.toLowerCase().includes(expectedSectionLower)
    ) {
      firstSectionMatchRank = rank;
    }
  }

  return {
    questionId: question.id,
    question: question.question,
    expectedSources,
    expectedSection: question.expectedSection,
    retrievedSources: [...retrievedSources],
    firstRelevantRank,
    firstSectionMatchRank,
  };
}

/**
 * Computes Hit@k and Mean Reciprocal Rank (MRR@k) across a set of question outcomes.
 * Both metrics evaluate only up to rank k and count only the first relevant result per question.
 */
export function computeMetricsAtK(
  outcomes: readonly QuestionRetrievalOutcome[],
  k: number,
): AggregatedMetrics {
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error('k must be a positive integer');
  }

  const totalQuestions = outcomes.length;
  if (totalQuestions === 0) {
    return {
      k,
      totalQuestions: 0,
      hitsAtK: 0,
      hitRateAtK: 0,
      mrrAtK: 0,
      questionsWithExpectedSection: 0,
      sectionHitsAtK: 0,
      sectionHitRateAtK: null,
    };
  }

  let hitsAtK = 0;
  let reciprocalRankSum = 0;
  let questionsWithExpectedSection = 0;
  let sectionHitsAtK = 0;

  for (const outcome of outcomes) {
    if (outcome.firstRelevantRank !== null && outcome.firstRelevantRank <= k) {
      hitsAtK += 1;
      reciprocalRankSum += 1 / outcome.firstRelevantRank;
    }

    if (outcome.expectedSection) {
      questionsWithExpectedSection += 1;
      if (outcome.firstSectionMatchRank !== null && outcome.firstSectionMatchRank <= k) {
        sectionHitsAtK += 1;
      }
    }
  }

  return {
    k,
    totalQuestions,
    hitsAtK,
    hitRateAtK: roundMetric(hitsAtK / totalQuestions),
    mrrAtK: roundMetric(reciprocalRankSum / totalQuestions),
    questionsWithExpectedSection,
    sectionHitsAtK,
    sectionHitRateAtK:
      questionsWithExpectedSection > 0
        ? roundMetric(sectionHitsAtK / questionsWithExpectedSection)
        : null,
  };
}
