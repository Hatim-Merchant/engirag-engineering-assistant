import {
  EvaluationQuestion,
  computeMetricsAtK,
  evaluateQuestionOutcome,
} from './evaluation-metrics';

describe('evaluation-metrics', () => {
  it('counts only the first relevant chunk per question when computing Hit@k and MRR', () => {
    const questions: EvaluationQuestion[] = [
      {
        id: 'q1',
        question: 'Q1 rank 1 hit with duplicate same-doc chunks',
        expectedSource: 'doc-a.md',
        expectedSection: 'Overview',
      },
      {
        id: 'q2',
        question: 'Q2 rank 2 hit',
        expectedSource: ['doc-b.md', 'doc-c.md'],
      },
      {
        id: 'q3',
        question: 'Q3 rank 4 hit (misses @3, hits @5)',
        expectedSource: 'doc-d.md',
        expectedSection: 'Routing',
      },
      {
        id: 'q4',
        question: 'Q4 complete miss',
        expectedSource: 'doc-e.md',
      },
    ];

    const outcomes = [
      evaluateQuestionOutcome(questions[0]!, [
        { externalId: 'doc-a.md', sectionHeading: 'Overview', score: 0.9 },
        { externalId: 'doc-a.md', sectionHeading: 'Details', score: 0.85 },
      ]),
      evaluateQuestionOutcome(questions[1]!, [
        { externalId: 'other.md', sectionHeading: 'Intro', score: 0.78 },
        { externalId: 'doc-c.md', sectionHeading: 'Units', score: 0.75 },
      ]),
      evaluateQuestionOutcome(questions[2]!, [
        { externalId: 'x.md', sectionHeading: 'A', score: 0.7 },
        { externalId: 'y.md', sectionHeading: 'B', score: 0.68 },
        { externalId: 'z.md', sectionHeading: 'C', score: 0.65 },
        { externalId: 'doc-d.md', sectionHeading: 'Controllers > Routing', score: 0.62 },
      ]),
      evaluateQuestionOutcome(questions[3]!, [
        { externalId: 'x.md', sectionHeading: 'A', score: 0.55 },
      ]),
    ];

    const metricsAt3 = computeMetricsAtK(outcomes, 3);
    expect(metricsAt3.hitsAtK).toBe(2);
    expect(metricsAt3.hitRateAtK).toBe(0.5);
    // MRR@3 = (1/1 + 1/2 + 0 + 0) / 4 = 1.5 / 4 = 0.375
    expect(metricsAt3.mrrAtK).toBe(0.375);
    expect(metricsAt3.questionsWithExpectedSection).toBe(2);
    expect(metricsAt3.sectionHitsAtK).toBe(1);
    expect(metricsAt3.sectionHitRateAtK).toBe(0.5);

    const metricsAt5 = computeMetricsAtK(outcomes, 5);
    expect(metricsAt5.hitsAtK).toBe(3);
    expect(metricsAt5.hitRateAtK).toBe(0.75);
    // MRR@5 = (1/1 + 1/2 + 1/4 + 0) / 4 = 1.75 / 4 = 0.4375
    expect(metricsAt5.mrrAtK).toBe(0.4375);
    expect(metricsAt5.sectionHitsAtK).toBe(2);
    expect(metricsAt5.sectionHitRateAtK).toBe(1);
  });

  it('rejects non-positive k values', () => {
    expect(() => computeMetricsAtK([], 0)).toThrow(/positive integer/);
  });
});
