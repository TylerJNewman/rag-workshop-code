import fs from 'fs/promises';
import path from 'path';
import type { TranscriptResponse, VideoDetails } from './fetchTranscript';

export interface SemanticChunk {
  chunkId: string;
  videoId: string; // Added videoId for context
  text: string;
  startOffset: number;
  endOffset: number;
}

const DEFAULT_OUTPUT_DIR = './output';
const APPROX_WORDS_PER_CHUNK = 150; // Target for Gemini prompt simulation

/**
 * SIMULATES calling an LLM (like Gemini) to split a formatted transcript
 * into semantically coherent chunks based on a target word count.
 *
 * NOTE: This is a placeholder simulation. A real implementation would involve:
 *       1. Setting up an LLM client (e.g., Gemini via Mastra Agent/Tool).
 *       2. Crafting the specific prompt mentioned by the user.
 *       3. Making an asynchronous API call to the LLM.
 *       4. Parsing the LLM's response (which should be an array of strings or similar).
 *       5. Handling potential errors from the API call.
 *
 * This simulation splits by paragraphs and roughly groups them.
 *
 * @param formattedTranscript The single string of cleaned transcript text.
 * @param targetWordsPerChunk Approximate desired words per chunk (used for simulation).
 * @returns A Promise resolving to an array of simulated semantic text chunks (strings).
 */
export async function getSemanticChunksFromLLM(
    formattedTranscript: string,
    targetWordsPerChunk: number = APPROX_WORDS_PER_CHUNK
): Promise<string[]> {
    console.log(`Simulating LLM semantic chunking (Target: ~${targetWordsPerChunk} words/chunk)...`);

    if (!formattedTranscript) {
        return [];
    }

    // Simple Simulation Logic: Split by paragraphs (double newlines)
    const paragraphs = formattedTranscript.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const simulatedChunks: string[] = [];
    let currentChunk = "";
    let currentWordCount = 0;

    for (const paragraph of paragraphs) {
        const paragraphWordCount = paragraph.split(/\s+/).filter(Boolean).length;

        if (currentWordCount > 0 && currentWordCount + paragraphWordCount > targetWordsPerChunk * 1.25) {
            // If adding the next paragraph significantly overshoots, finalize the current chunk
            simulatedChunks.push(currentChunk.trim());
            currentChunk = paragraph;
            currentWordCount = paragraphWordCount;
        } else {
            // Otherwise, add the paragraph to the current chunk
            currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
            currentWordCount += paragraphWordCount;

            // If the current chunk is getting reasonably large, finalize it
            if (currentWordCount >= targetWordsPerChunk * 0.75) {
                 simulatedChunks.push(currentChunk.trim());
                 currentChunk = "";
                 currentWordCount = 0;
            }
        }
    }

    // Add any remaining text as the last chunk
    if (currentChunk.trim()) {
        simulatedChunks.push(currentChunk.trim());
    }

    console.log(`LLM Simulation produced ${simulatedChunks.length} chunks.`);
    // Simulate async nature of an API call
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate short delay
    return simulatedChunks;
}


/**
 * Attempts to map externally generated semantic text chunks back to the
 * original transcript segments to estimate timestamps.
 *
 * NOTE: This mapping is approximate and relies on finding the start/end
 *       of the semantic chunks within the original segments' text.
 *       Accuracy depends heavily on the quality and boundaries of the
 *       semantic chunks provided by the external process (e.g., Gemini).
 *
 * @param videoId The ID of the video.
 * @param originalTranscript The raw transcript segments with original timings.
 * @param semanticTextChunks An array of text strings, each representing a semantic chunk.
 * @returns An array of SemanticChunk objects with estimated timestamps.
 */
export function mapTimestampsToSemanticChunks(
  videoId: string,
  originalTranscript: TranscriptResponse[],
  semanticTextChunks: string[] // Output from Gemini/LLM
): SemanticChunk[] {
  if (!originalTranscript || originalTranscript.length === 0 || !semanticTextChunks || semanticTextChunks.length === 0) {
    console.warn("Missing original transcript or semantic chunks, cannot map timestamps.");
    return [];
  }

  const mappedChunks: SemanticChunk[] = [];
  let currentOriginalSegmentIndex = 0; // Tracks our position in the original transcript

  console.log(`Starting timestamp mapping for ${semanticTextChunks.length} semantic chunks.`);

  for (let chunkIndex = 0; chunkIndex < semanticTextChunks.length; chunkIndex++) {
    const semanticText = semanticTextChunks[chunkIndex]?.trim(); // Ensure chunk text is valid
    if (!semanticText) {
      console.warn(`Skipping empty semantic chunk at index ${chunkIndex}.`);
      continue;
    }

    // --- Find Start Timestamp ---
    let startOffset: number | null = null;
    let startSegmentFoundIndex = -1;
    const searchStartIndex = currentOriginalSegmentIndex; // Start searching from where the last chunk likely ended

    for (let i = searchStartIndex; i < originalTranscript.length; i++) {
      const segmentText = originalTranscript[i].text.trim();
      if (!segmentText) continue; // Skip empty original segments

      // Simple Strategy: Check if the original segment *starts with* or *contains* the beginning of the semantic chunk.
      // Normalize for comparison (lowercase, trim). Consider removing punctuation if needed.
      const segmentTextNorm = segmentText.toLowerCase();
      // Use a shorter prefix for matching, as LLM might rephrase slightly
      const prefixLength = Math.min(segmentText.length, 30);
      const semanticStartNorm = semanticText.substring(0, prefixLength).toLowerCase();

      // Increase tolerance: check includes() as well
      if (segmentTextNorm.startsWith(semanticStartNorm) || (prefixLength > 5 && segmentTextNorm.includes(semanticStartNorm))) {
        startOffset = originalTranscript[i].offset;
        startSegmentFoundIndex = i;
        // console.log(`Found potential start for chunk ${chunkIndex} in segment ${i} at offset ${startOffset.toFixed(3)}`);
        break;
      }
    }

    // Handle case where start wasn't found (might indicate LLM hallucination or significant rephrasing)
    if (startOffset === null) {
      console.warn(`Could not confidently map start timestamp for chunk ${chunkIndex}. Text: "${semanticText.substring(0, 70)}...". Assigning approximate start based on last position.`);
       // Best guess: Start where the last chunk likely ended.
       if (searchStartIndex < originalTranscript.length) {
           startOffset = originalTranscript[searchStartIndex].offset;
           startSegmentFoundIndex = searchStartIndex;
       } else if (mappedChunks.length > 0) {
           // If truly lost, start right after the previous chunk ended
           startOffset = mappedChunks[mappedChunks.length - 1].endOffset;
           startSegmentFoundIndex = currentOriginalSegmentIndex; // Might be inaccurate index, but best guess
           console.warn(`  -> Starting chunk ${chunkIndex} immediately after previous chunk's end offset.`);
       }
       else {
           console.error(`Cannot determine start for chunk ${chunkIndex}, skipping.`);
           continue; // Skip this chunk if we can't even guess a start
       }
    }

    // --- Find End Timestamp ---
    let endOffset: number | null = null;
    // Start searching for the end from the segment where the chunk started, or slightly after where the *previous* chunk ended
    const searchEndIndex = Math.max(startSegmentFoundIndex, currentOriginalSegmentIndex -1 ); // Check segment i again potentially

    for (let i = searchEndIndex; i < originalTranscript.length; i++) {
       const segmentText = originalTranscript[i].text.trim();
       if (!segmentText) continue;

       // Simple Strategy: Check if this original segment *contains the end* of the semantic chunk.
       const segmentTextNorm = segmentText.toLowerCase();
       // Use a shorter suffix for matching
       const suffixLength = Math.min(segmentText.length, 30);
       const semanticEndNorm = semanticText.substring(Math.max(0, semanticText.length - suffixLength)).toLowerCase();

       // Increase tolerance: check includes()
       if (segmentTextNorm.endsWith(semanticEndNorm) || (suffixLength > 5 && segmentTextNorm.includes(semanticEndNorm))) {
            // Assume the chunk ends when the segment containing its end-text ends.
            endOffset = originalTranscript[i].offset + originalTranscript[i].duration;
            currentOriginalSegmentIndex = i + 1; // Set starting point for the *next* chunk's search
            // console.log(`Found potential end for chunk ${chunkIndex} in segment ${i} at offset ${endOffset.toFixed(3)}`);
            break;
       }
    }

    // Handle case where end wasn't clearly found
    if (endOffset === null) {
        // Fallback 1: If it's the very last semantic chunk, assume it runs to the end of the transcript.
        if (chunkIndex === semanticTextChunks.length - 1 && originalTranscript.length > 0) {
            const lastOrigSegment = originalTranscript[originalTranscript.length - 1];
            endOffset = lastOrigSegment.offset + lastOrigSegment.duration;
            currentOriginalSegmentIndex = originalTranscript.length;
            console.warn(`End not mapped for last chunk ${chunkIndex}, assigning end of transcript timestamp.`);
        }
        // Fallback 2: Assign end time of the segment where the chunk started (least accurate).
        else if (startSegmentFoundIndex !== -1) {
            const startSegment = originalTranscript[startSegmentFoundIndex];
            endOffset = startSegment.offset + startSegment.duration;
             // Advance cautiously - maybe the next chunk starts in the *same* segment
             currentOriginalSegmentIndex = startSegmentFoundIndex + 1;
            console.warn(`Could not confidently map end timestamp for chunk ${chunkIndex}. Text: "...${semanticText.substring(semanticText.length - 70)}". Assigning approximate end based on start segment.`);
        } else {
             console.error(`Cannot determine end for chunk ${chunkIndex}, skipping.`);
             continue; // Skip if we can't determine start or end
        }
    }

    // Ensure end isn't before start (can happen with poor mapping)
    if (endOffset < startOffset) {
        console.warn(`Calculated end offset (${endOffset.toFixed(3)}) is before start offset (${startOffset.toFixed(3)}) for chunk ${chunkIndex}. Adjusting end offset.`);
        endOffset = startOffset + 0.01; // Set end just slightly after start as a minimal fix
    }

    mappedChunks.push({
      chunkId: `${videoId}-chunk-${chunkIndex}`, // More specific ID
      videoId: videoId,
      text: semanticText,
      startOffset: parseFloat(startOffset.toFixed(3)),
      endOffset: parseFloat(endOffset.toFixed(3)),
    });
  }

  console.log(`Finished timestamp mapping. Generated ${mappedChunks.length} chunks.`);
  return mappedChunks;
}


/**
 * Writes the semantic chunks to a JSON file.
 *
 * @param videoId The ID of the video.
 * @param chunks An array of SemanticChunk objects.
 * @param outputDir The directory to write the file to. Defaults to ./output
 */
export const writeChunksToFile = async (
    videoId: string,
    chunks: SemanticChunk[],
    filenameSuffix = '_semantic_chunks.json'
) => {
    await ensureOutputDir();
    const filename = `${videoId}${filenameSuffix}`;
    const filepath = path.join(DEFAULT_OUTPUT_DIR, filename);
    try {
        await fs.writeFile(filepath, JSON.stringify(chunks, null, 2));
        console.log(`Successfully wrote ${chunks.length} semantic chunks to ${filepath}`);
    } catch (error) {
        console.error(`Error writing chunks to file ${filepath}:`, error);
        throw error; // Re-throw the error for the workflow to handle if necessary
    }
};

// Ensure output directory exists
const ensureOutputDir = async () => {
    try {
        await fs.access(DEFAULT_OUTPUT_DIR);
    } catch (error) {
        await fs.mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });
    }
};

// Function to write a summary string to a text file
export const writeSummaryToFile = async (
    videoId: string,
    summary: string,
    filenameSuffix = '_summary.txt'
) => {
    await ensureOutputDir();
    const filename = `${videoId}${filenameSuffix}`;
    const filepath = path.join(DEFAULT_OUTPUT_DIR, filename);
    try {
        await fs.writeFile(filepath, summary);
        console.log(`Successfully wrote summary to ${filepath}`);
    } catch (error) {
        console.error(`Error writing summary to file ${filepath}:`, error);
        throw error; // Re-throw the error for the workflow to handle if necessary
    }
};

// Re-export needed types
export type { TranscriptResponse, VideoDetails }; 