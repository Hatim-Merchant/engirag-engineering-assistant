import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const baseValidEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: 'postgresql://engirag:engirag_dev_password@localhost:5432/engirag',
  };

  it('parses a valid minimal environment and applies defaults', () => {
    const config = validateEnv(baseValidEnv);

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(config.EMBEDDING_MODEL).toBe('Xenova/all-MiniLM-L6-v2');
    expect(config.EMBEDDING_DIMENSIONS).toBe(384);
    expect(config.LLM_PROVIDER).toBe('groq');
    expect(config.CHUNK_SIZE_TOKENS).toBe(500);
    expect(config.CHUNK_OVERLAP_TOKENS).toBe(75);
    expect(config.RETRIEVAL_TOP_K).toBe(5);
    expect(config.RETRIEVAL_MIN_SCORE).toBe(0.35);
  });

  it('treats empty PORT string as unset and applies the default port', () => {
    const config = validateEnv({
      ...baseValidEnv,
      PORT: '',
    });

    expect(config.PORT).toBe(3000);
  });

  it('rejects an invalid PORT value with a descriptive error', () => {
    expect(() =>
      validateEnv({
        ...baseValidEnv,
        PORT: 'not-a-port',
      }),
    ).toThrow(/Invalid environment configuration:.*PORT/);
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'http://localhost:5432/engirag',
      }),
    ).toThrow(/Invalid environment configuration:.*DATABASE_URL/);
  });

  it('rejects CHUNK_OVERLAP_TOKENS greater than or equal to CHUNK_SIZE_TOKENS', () => {
    expect(() =>
      validateEnv({
        ...baseValidEnv,
        CHUNK_SIZE_TOKENS: '300',
        CHUNK_OVERLAP_TOKENS: '300',
      }),
    ).toThrow(/CHUNK_OVERLAP_TOKENS must be smaller than CHUNK_SIZE_TOKENS/);
  });
});
