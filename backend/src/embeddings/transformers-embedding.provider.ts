import { FeatureExtractionPipeline, Tensor, pipeline } from '@huggingface/transformers';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { EmbeddingProvider, normalizeEmbeddingInput } from './embedding.provider';

@Injectable()
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(TransformersEmbeddingProvider.name);
  readonly modelName: string;
  readonly dimensions: number;
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(private readonly config: AppConfigService) {
    this.modelName = this.config.embeddingModel;
    this.dimensions = this.config.embeddingDimensions;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedDocuments([text]);
    if (!vector) {
      throw new Error('Failed to generate query embedding');
    }
    return vector;
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const normalizedTexts = texts.map(normalizeEmbeddingInput);
    for (const item of normalizedTexts) {
      if (!item) {
        throw new Error('Cannot generate embedding for empty text');
      }
    }

    const extractor = await this.getExtractor();
    const output = await extractor(normalizedTexts, {
      pooling: 'mean',
      normalize: true,
    });

    return this.extractVectors(output, normalizedTexts.length);
  }

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.logger.log(`Loading local CPU embedding model: ${this.modelName}`);
      this.extractorPromise = pipeline('feature-extraction', this.modelName, {
        dtype: 'fp32',
      }).catch((error: unknown) => {
        // Reset cached promise so a transient download/load failure can be retried.
        this.extractorPromise = null;
        throw error;
      });
    }

    return this.extractorPromise;
  }

  private extractVectors(tensor: Tensor, expectedCount: number): number[][] {
    const batchSize = tensor.dims[0] ?? expectedCount;
    const vectorDim = tensor.dims[1] ?? this.dimensions;

    if (batchSize !== expectedCount) {
      throw new Error(`Expected ${expectedCount} embeddings, received ${batchSize}`);
    }
    if (vectorDim !== this.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: configured ${this.dimensions}, model produced ${vectorDim}`,
      );
    }

    const rawData: unknown = tensor.data;
    if (!(rawData instanceof Float32Array || rawData instanceof Float64Array)) {
      throw new Error(`Unexpected embedding tensor buffer type: ${tensor.type}`);
    }

    const vectors: number[][] = [];
    for (let row = 0; row < batchSize; row += 1) {
      const start = row * vectorDim;
      const vector = Array.from(rawData.subarray(start, start + vectorDim));

      if (vector.length !== vectorDim || vector.some((val) => !Number.isFinite(val))) {
        throw new Error(`Invalid non-finite embedding values generated at batch index ${row}`);
      }
      vectors.push(vector);
    }

    return vectors;
  }
}
