import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RagApiError, askEngineeringQuestion } from '../src/services/rag-api';
import type { AskQuestionResponse } from '../src/types/rag';
import AssistantView from '../src/views/AssistantView.vue';

vi.mock('../src/services/rag-api', async () => {
  const actual =
    await vi.importActual<typeof import('../src/services/rag-api')>('../src/services/rag-api');
  return {
    ...actual,
    askEngineeringQuestion: vi.fn(),
  };
});

const askQuestionMock = vi.mocked(askEngineeringQuestion);

describe('AssistantView', () => {
  const sampleResponse: AskQuestionResponse = {
    answer:
      'The Vehicle Signal Specification introduces a domain taxonomy for vehicle signals [1] and defines a common catalog of data types [2].',
    sources: [
      {
        number: 1,
        title: 'Overview',
        url: 'https://covesa.github.io/vehicle_signal_specification/introduction/overview/#what-is-vss',
        section: 'What is VSS?',
        excerpt:
          'The Vehicle Signal Specification introduces a domain taxonomy for vehicle signals.',
        score: 0.6848,
      },
      {
        number: 2,
        title: 'Data Types',
        url: 'https://covesa.github.io/vehicle_signal_specification/rule_set/data_entry/data_types/#supported-types',
        section: 'Supported Types',
        excerpt: 'VSS supports standard scalar and array data types for signals.',
        score: 0.5912,
      },
    ],
  };

  beforeEach(() => {
    askQuestionMock.mockReset();
  });

  it('renders project header and empty state initially', () => {
    const wrapper = mount(AssistantView);

    expect(wrapper.text()).toContain('EngiRAG');
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.find('.answer-card').exists()).toBe(false);
  });

  it('displays loading state while awaiting backend response', async () => {
    let resolveRequest!: (value: AskQuestionResponse) => void;
    askQuestionMock.mockImplementation(
      () =>
        new Promise<AskQuestionResponse>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const wrapper = mount(AssistantView);
    await wrapper.find('#question-textarea').setValue('What is the purpose of VSS?');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.find('.loading-state').exists()).toBe(true);
    expect(wrapper.find('.ask-button').attributes('disabled')).toBeDefined();

    resolveRequest(sampleResponse);
    await flushPromises();

    expect(wrapper.find('.loading-state').exists()).toBe(false);
    expect(wrapper.find('.answer-card').exists()).toBe(true);
  });

  it('renders grounded answer with clickable citation links and collapsible retrieved sources', async () => {
    askQuestionMock.mockResolvedValueOnce(sampleResponse);

    const wrapper = mount(AssistantView);
    await wrapper
      .find('#question-textarea')
      .setValue('What is the purpose of the Vehicle Signal Specification?');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(askQuestionMock).toHaveBeenCalledWith(
      'What is the purpose of the Vehicle Signal Specification?',
    );

    const citationLinks = wrapper.findAll('.citation-badge');
    expect(citationLinks).toHaveLength(2);
    expect(citationLinks[0]?.text()).toBe('[1]');
    expect(citationLinks[0]?.attributes('href')).toBe(sampleResponse.sources[0]?.url);
    expect(citationLinks[0]?.attributes('target')).toBe('_blank');
    expect(citationLinks[1]?.text()).toBe('[2]');
    expect(citationLinks[1]?.attributes('href')).toBe(sampleResponse.sources[1]?.url);

    // Sources panel starts collapsed and expands on button click.
    expect(wrapper.find('#retrieved-sources-panel').exists()).toBe(false);
    await wrapper.find('.toggle-sources-button').trigger('click');

    expect(wrapper.find('#retrieved-sources-panel').exists()).toBe(true);
    const items = wrapper.findAll('.source-item');
    expect(items).toHaveLength(2);
    expect(items[0]?.text()).toContain('Overview');
    expect(items[0]?.text()).toContain('What is VSS?');
    expect(items[0]?.text()).toContain(sampleResponse.sources[0]?.excerpt ?? '');
    expect(items[0]?.find('.source-external-link').attributes('href')).toBe(
      sampleResponse.sources[0]?.url,
    );
  });

  it('submits starter prompt when clicked and highlights source when inline citation is clicked', async () => {
    askQuestionMock.mockResolvedValueOnce(sampleResponse);

    const wrapper = mount(AssistantView);
    const firstStarter = wrapper.find('.starter-chip');
    await firstStarter.trigger('click');
    await flushPromises();

    expect(askQuestionMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('#retrieved-sources-panel').exists()).toBe(false);

    // Clicking an inline citation auto-expands the sources panel and highlights that source.
    await wrapper.find('.citation-badge').trigger('click');

    expect(wrapper.find('#retrieved-sources-panel').exists()).toBe(true);
    expect(wrapper.findAll('.source-item')[0]?.classes()).toContain('source-item-highlighted');
  });

  it('displays error banner when the API returns an error', async () => {
    askQuestionMock.mockRejectedValueOnce(
      new RagApiError('Groq rate limit exceeded after bounded retries.', 429),
    );

    const wrapper = mount(AssistantView);
    await wrapper.find('#question-textarea').setValue('How do NestJS guards work?');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const errorBanner = wrapper.find('.error-state');
    expect(errorBanner.exists()).toBe(true);
    expect(errorBanner.text()).toContain('Groq rate limit exceeded after bounded retries.');
    expect(wrapper.find('.answer-card').exists()).toBe(false);
  });

  it('strips Markdown asterisks around text and citation badges', async () => {
    askQuestionMock.mockResolvedValueOnce({
      answer:
        '1. **Declare a provider** – A class uses *constructor injection*. *[1]* Also see [2].',
      sources: sampleResponse.sources,
    });

    const wrapper = mount(AssistantView);
    await wrapper.find('#question-textarea').setValue('How does dependency injection work?');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const answerBody = wrapper.find('.answer-body');
    expect(answerBody.exists()).toBe(true);
    expect(answerBody.text()).not.toContain('*');
    expect(answerBody.text()).toContain(
      '1. Declare a provider – A class uses constructor injection.',
    );

    const citationLinks = wrapper.findAll('.citation-badge');
    expect(citationLinks).toHaveLength(2);
    expect(citationLinks[0]?.text()).toBe('[1]');
    expect(citationLinks[1]?.text()).toBe('[2]');
  });
});
