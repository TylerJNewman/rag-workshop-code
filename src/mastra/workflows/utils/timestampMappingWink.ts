// ./utils/timestampMappingWink.ts
import { WinkMethods, ItemToken } from 'wink-nlp';
import BM25Vectorizer from 'wink-nlp/utilities/bm25-vectorizer';
// Import the similarity utility itself
import similarity from 'wink-nlp/utilities/similarity';
import { TranscriptResponse } from './fetchTranscript'; // Adjust path if needed

// Re-define TimedChunk here or import if defined globally
export interface TimedChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Helper function to get the first N words (tokens) using wink-nlp tokenizer.
 */
function getFirstNWordsWink(text: string, n: number, nlp: WinkMethods): string {
  if (!text || n <= 0) return '';
  const doc = nlp.readDoc(text);
  // Filter out punctuation/spaces if needed, depending on desired 'word' count
  // Assuming 'its' is available via nlp.its
  const tokens = doc.tokens().filter((t: ItemToken) => t.out(nlp.its.type) === 'word');
  return tokens.out().slice(0, n).join(' '); // Get text of first N words
}


// Assume 'its' is available from wink-nlp instance via nlp.its
// We don't need `declare const its: NlpIts;` as it's accessed via nlp.its

export function mapFineChunksToTimestampsWink(
  originalSegments: TranscriptResponse[],
  fineTextChunks: string[],
  nlp: WinkMethods,
  config?: {
    wordsToMatch?: number;
    cosineSimilarityThreshold?: number;
  }
): TimedChunk[] {

  const {
    wordsToMatch = 15,
    cosineSimilarityThreshold = 0.1 // LOWERED Cosine threshold (0-1)
  } = config || {};

  console.log(`[mapFineChunksWink] Starting mapping. Words: ${wordsToMatch}, Threshold: ${cosineSimilarityThreshold}`);

  const timedChunks: TimedChunk[] = [];

  // --- Input Validation ---
  if (!originalSegments || originalSegments.length === 0) {
     console.error('[mapFineChunksWink] Error: Original transcript segments are missing or empty.');
     return [];
  }
  if (!fineTextChunks || fineTextChunks.length === 0) {
     console.warn('[mapFineChunksWink] No fine text chunks provided. Returning empty array.');
     return [];
  }
  if (!nlp) {
     console.error('[mapFineChunksWink] Error: winkNLP instance not provided.');
     return [];
  }
  // Check if the necessary similarity function exists
  if (!similarity || !similarity.vector || !similarity.vector.cosine) {
      console.error('[mapFineChunksWink] Error: similarity.vector.cosine utility not available.');
      return [];
  }
  if (!nlp.its) {
      console.error('[mapFineChunksWink] Error: nlp.its is not available. Cannot access token properties.');
      return [];
  }

  try {
    // --- Preprocessing Snippets ---
    console.log(`[mapFineChunksWink] Preparing snippets for ${originalSegments.length} segments...`);
    const segmentSnippets = originalSegments.map((segment, index) => ({
      id: `seg_${index}`,
      text: getFirstNWordsWink(segment.text || '', wordsToMatch, nlp),
      originalIndex: index
    })).filter(s => s.text.trim().length > 0);

    if (segmentSnippets.length === 0) {
        console.error('[mapFineChunksWink] Error: No valid segment snippets found after preprocessing.');
        return [];
    }
    if (segmentSnippets.length !== originalSegments.length) {
       console.warn(`[mapFineChunksWink] Filtered out ${originalSegments.length - segmentSnippets.length} original segments due to empty snippets after truncation.`);
    }

    // --- BM25 Learning --- NOTE: We still use BM25Vectorizer to get document vectors
    console.log(`[mapFineChunksWink] Training BM25 model on ${segmentSnippets.length} segment snippets...`);
    const bm25 = BM25Vectorizer();
    for (const snippet of segmentSnippets) {
      // Process with winkNLP to get tokens suitable for BM25
      const doc = nlp.readDoc(snippet.text);
      const tokens = doc.tokens()
                     .filter((t: ItemToken) => !t.out(nlp.its.stopWordFlag) && t.out(nlp.its.type) === 'word')
                     .out(nlp.its.normal);
      bm25.learn(tokens);
    }

    // --- Get Vectors for Learned Segments --- 
    // Revert to using string literal 'terms' due to persistent type errors with nlp.its.terms
    // Disable linter warning for this line and use type assertion `as any`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
const  learnedTermsResult = bm25.out('terms' as any);
    // Check the type of learnedTerms if necessary, console.log implies it's expected to have a length property.
    if (!Array.isArray(learnedTermsResult)) {
        console.error(`[mapFineChunksWink] Error: bm25.out('terms') did not return an array. Type: ${typeof learnedTermsResult}`);
        return []; // Cannot proceed if terms are not an array
    }
    const learnedTerms: string[] = learnedTermsResult; // Assert type after check

    console.log(`[mapFineChunksWink] BM25 Model learned ${learnedTerms.length} terms.`);

    const segmentVectors = segmentSnippets.map((snippet, learnedIndex) => {
         // Get the vector for the nth learned document
         const vectorResult = bm25.doc(learnedIndex).out(nlp.its.vector);
         // Add type check for vectorResult
         if (typeof vectorResult === 'string' || !Array.isArray(vectorResult)) {
             console.warn(`[mapFineChunksWink] Warning: Could not get valid vector for learned segment index ${learnedIndex} (original index ${snippet.originalIndex}). Result: ${vectorResult}`);
             return { originalIndex: snippet.originalIndex, vector: null };
         }
         const vector: number[] = vectorResult; // Now confirmed as number[]

         if (!vector || vector.length === 0) {
             console.warn(`[mapFineChunksWink] Warning: Empty vector for learned segment index ${learnedIndex} (original index ${snippet.originalIndex})`);
             return { originalIndex: snippet.originalIndex, vector: null };
         }

         // *** IMPORTANT: The wink cosine utility expects the L2 norm as the LAST element. ***
         // We need to calculate and append it if bm25.out(its.vector) doesn't include it.
         let norm = 0;
         // Ensure vector elements are numbers before calculation
         for (let k = 0; k < vector.length; k++) { 
             const val = vector[k];
             if (typeof val !== 'number') {
                 console.error(`[mapFineChunksWink] Non-numeric value found in segment vector at index ${k} for learnedIndex ${learnedIndex}. Value: ${val}`);
                 // Handle error - perhaps return null or skip this vector
                 return { originalIndex: snippet.originalIndex, vector: null }; 
             }
             norm += vector[k] * vector[k];
         }
         norm = Math.sqrt(norm);
         // Create a new array with the norm appended
         const vectorWithNorm: number[] = [...vector, norm]; // Explicitly type

         return {
             originalIndex: snippet.originalIndex,
             vector: vectorWithNorm
         };
    }).filter(v => v.vector !== null); // Filter out any segments that failed to produce a vector

    if (segmentVectors.length === 0) {
        console.error("[mapFineChunksWink] Error: No valid segment vectors generated.");
        return [];
    }
    console.log(`[mapFineChunksWink] Generated ${segmentVectors.length} valid segment vectors.`);

    // --- Process Chunks and Calculate Similarities --- 
    console.log(`[mapFineChunksWink] Calculating similarities for ${fineTextChunks.length} chunks...`);
    for (let i = 0; i < fineTextChunks.length; i++) {
      const originalChunkText = fineTextChunks[i];
      const chunkSnippetText = getFirstNWordsWink(originalChunkText || '', wordsToMatch, nlp);

      if (!chunkSnippetText || chunkSnippetText.trim().length === 0) {
         console.warn(`[mapFineChunksWink] Skipping chunk index ${i} due to empty snippet after truncation.`);
         continue;
      }
      if (!originalChunkText || originalChunkText.trim().length === 0) {
         console.warn(`[mapFineChunksWink] Skipping empty original chunk text at index ${i}.`);
         continue;
      }

      // Get the vector for the new chunk snippet using the *same* BM25 model
      const chunkDoc = nlp.readDoc(chunkSnippetText);
      const chunkTokens = chunkDoc.tokens()
                           .filter((t: ItemToken) => !t.out(nlp.its.stopWordFlag) && t.out(nlp.its.type) === 'word')
                           .out(nlp.its.normal);
      const chunkVector: number[] = bm25.vectorOf(chunkTokens); // Explicitly type

      if (!chunkVector || chunkVector.length === 0) {
           console.warn(`[mapFineChunksWink] Could not generate vector for chunk ${i}. Text: "${chunkSnippetText.substring(0, 30)}..."`);
           continue;
       }

       // *** Append L2 norm to chunk vector ***
       let chunkVectorWithNorm: number[] | null = chunkVector && chunkVector.length > 0 ? [...chunkVector] : null; // Initialize with a copy if chunkVector is valid and non-empty
       let chunkNorm = 0;
       let isValid = !!chunkVectorWithNorm; // Flag to track validity, initially true only if vector is non-null

       if (isValid && chunkVectorWithNorm) { // Only proceed if initial vector is valid (check chunkVectorWithNorm for type safety)
           for (let k = 0; k < chunkVector.length; k++) {
               const val = chunkVector[k];
               if (typeof val !== 'number' || Number.isNaN(val)) { // Check for non-number and NaN
                   console.error(`[mapFineChunksWink] Non-numeric or NaN value found in chunk vector at index ${k} for chunk ${i}. Value: ${val}`);
                   isValid = false;
                   break; // Stop calculation for this chunk
               }
               chunkNorm += val * val; // Use checked val
           }

           if (isValid) { // Check if loop completed without errors
               chunkNorm = Math.sqrt(chunkNorm);
               if (Number.isNaN(chunkNorm)) { // Check if norm calculation itself resulted in NaN
                  console.error(`[mapFineChunksWink] Calculated norm is NaN for chunk ${i}. Original vector sum of squares: ${chunkNorm * chunkNorm}`);
                  isValid = false;
               } else {
                 // Append the norm to the vector copy
                 chunkVectorWithNorm.push(chunkNorm);
               }
           }

           // If loop or norm calculation failed, nullify the final vector
           if (!isValid) {
               chunkVectorWithNorm = null;
           }
       } else {
           // Initial chunkVector was null or empty, ensure isValid is false
           isValid = false;
           chunkVectorWithNorm = null;
       }

       // Calculate Cosine Similarity using the wink-nlp utility
       let bestMatchOriginalIndex = -1;
       let bestScore = -1;

       // Skip comparison if chunk vector is invalid
       if (!chunkVectorWithNorm) { // Check remains the same, but should now work correctly
           console.warn(`[mapFineChunksWink] Skipping similarity calculation for chunk ${i} due to invalid vector (failed norm calculation or non-numeric values).`);
           continue;
       }

       for (const segmentVecData of segmentVectors) {
           // Ensure vectors are valid before comparison
           if (!segmentVecData.vector || segmentVecData.vector.length <= 1 || chunkVectorWithNorm.length <= 1) {
                // Length must be > 1 to include the norm
                console.warn(`[mapFineChunksWink] Skipping comparison due to invalid vector(s) for chunk ${i} and segment ${segmentVecData.originalIndex}`);
                continue;
           }

           // The utility expects vectors of the same dimension, which BM25 ensures.
           // It also expects the L2 norm as the last element.
           const score = similarity.vector.cosine(chunkVectorWithNorm, segmentVecData.vector);

           if (score > bestScore) {
               bestScore = score;
               bestMatchOriginalIndex = segmentVecData.originalIndex;
           }
       }

       // --- Timestamp Assignment ---
       if (bestMatchOriginalIndex !== -1 && bestScore >= cosineSimilarityThreshold) {
         // Determine the index of the segment to use for timestamping
         const segmentIndexToUse = bestMatchOriginalIndex > 0 ? bestMatchOriginalIndex - 1 : bestMatchOriginalIndex; // Use preceding segment if available, otherwise use the best match

         const segmentForTimestamp = originalSegments[segmentIndexToUse];

         // Check if the chosen segment and its timestamps are valid
         if (!segmentForTimestamp) {
             console.warn(`[mapFineChunksWink] Could not find segment at index ${segmentIndexToUse} (derived from best match ${bestMatchOriginalIndex}) for timestamping chunk ${i}. Skipping.`);
             continue;
         }

         const startOffset = segmentForTimestamp.offset; // Assume offset is in seconds
         const endOffset = segmentForTimestamp.offset + segmentForTimestamp.duration; // Assume duration is in seconds

         // Basic sanity check for timestamps from the *chosen* segment
         if (typeof startOffset !== 'number' || Number.isNaN(startOffset) || typeof endOffset !== 'number' || Number.isNaN(endOffset) || endOffset < startOffset) {
              console.warn(`[mapFineChunksWink] Invalid timestamps found for segment index ${segmentIndexToUse} used for chunk ${i}. Score: ${bestScore.toFixed(4)}. Start: ${startOffset}, End: ${endOffset}. Skipping chunk ${i}.`);
              continue;
          }

         timedChunks.push({
           text: originalChunkText, // Keep the original chunk's text
           startOffset: parseFloat(startOffset.toFixed(3)),
           endOffset: parseFloat(endOffset.toFixed(3)),
         });
         // Optional: Log success, indicating which segment's time was used
         // console.log(`[mapFineChunksWink] Chunk ${i} matched best with segment ${bestMatchOriginalIndex} (Score: ${bestScore.toFixed(4)}), used segment ${segmentIndexToUse} for timestamp -> [${startOffset.toFixed(3)} - ${endOffset.toFixed(3)}]`);

       } else {
         const reason = bestMatchOriginalIndex === -1 ? 'No suitable match found via vector comparison.'
           : `Best cosine score ${bestScore.toFixed(4)} is below threshold ${cosineSimilarityThreshold}.`;
         console.warn(
           `[mapFineChunksWink] Could not map chunk ${i}. ${reason} Text: "${chunkSnippetText.substring(0, 30)}..."`
         );
       }
    }

  } catch (error) {
    console.error('[mapFineChunksWink] Unexpected error during timestamp mapping:', error);
    // Decide whether to return partial results or throw
    // return []; // Return empty on error
    throw error; // Re-throw to signal failure
  }

  console.log(`[mapFineChunksWink] Finished mapping. Created ${timedChunks.length} timed chunks from ${fineTextChunks.length} inputs.`);
  return timedChunks;
}