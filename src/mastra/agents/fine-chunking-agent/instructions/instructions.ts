export const instructions: string = String.raw`Given the following transcript text, split it into semantically coherent paragraphs, each approximately 100-200 words long. Focus on keeping key ideas and concepts within the same paragraph. 

Return the result as a JSON array of strings, where each string is one paragraph chunk. 

Example Output:
["First paragraph text...", "Second paragraph text...", "Third paragraph text..."]`
