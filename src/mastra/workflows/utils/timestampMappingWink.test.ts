import { describe, it, expect } from 'vitest';
import { mapFineChunksToTimestampsWink } from './timestampMappingWink';
import winkNLP from 'wink-nlp';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - This is a dynamic import for a model file
import model from 'wink-eng-lite-web-model';
import { TranscriptResponse } from './fetchTranscript'; // Assuming this path is correct

// Initialize winkNLP
const nlp = winkNLP(model);

describe('mapFineChunksToTimestampsWink', () => {
  it('should map a simple chunk to its corresponding segment timestamp', () => {
    // --- Test Data ---
    const originalSegments: TranscriptResponse[] = [
      { text: 'This is the first sentence.', offset: 0, duration: 3000, lang: 'en' },
      { text: 'And here comes the second one.', offset: 3500, duration: 4000, lang: 'en' },
      { text: 'Finally, the third segment arrives.', offset: 8000, duration: 5000, lang: 'en' },
    ];

    const fineTextChunks: string[] = [
      'This is the first sentence.', // Exact match
      'the second one.'             // Partial match
    ];

    // --- Configuration ---
    const config = {
      wordsToMatch: 5, // Use fewer words for simple matching
      similarityThreshold: 0.01 // Low threshold for testing
    };

    // --- Function Call ---
    const timedChunks = mapFineChunksToTimestampsWink(
      originalSegments,
      fineTextChunks,
      nlp,
      config
    );

    // --- Assertions ---
    expect(timedChunks).toBeDefined();
    expect(timedChunks).toHaveLength(2); // Expect both chunks to map

    // Check the first mapped chunk (exact match)
    expect(timedChunks[0]).toEqual({
      text: 'This is the first sentence.',
      startOffset: 0, // ms
      endOffset: 3000 // ms (0 + 3000)
    });

    // Check the second mapped chunk (partial match)
    expect(timedChunks[1]).toEqual({
      text: 'the second one.',
      startOffset: 3500, // ms
      endOffset: 7500  // ms (3500 + 4000)
    });
  });

   it('should return empty array if no segments provided', () => {
    const timedChunks = mapFineChunksToTimestampsWink([], ['chunk1'], nlp);
    expect(timedChunks).toEqual([]);
  });

  it('should return empty array if no chunks provided', () => {
     const originalSegments: TranscriptResponse[] = [
      { text: 'Segment 1', offset: 0, duration: 1000, lang: 'en' },
    ];
    const timedChunks = mapFineChunksToTimestampsWink(originalSegments, [], nlp);
    expect(timedChunks).toEqual([]);
  });

  // Add more tests for edge cases:
  // - No match found
  // - Threshold filtering
  // - Empty strings in input
  // - Segments/chunks shorter than wordsToMatch
}); 