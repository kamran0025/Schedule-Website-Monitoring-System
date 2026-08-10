// Extractive summarization: no external API, no cost. Scores each sentence by
// how many non-stopword terms it contains (weighted by how often those terms
// recur across the article - a proxy for "this is a main topic"), then keeps
// the highest-scoring sentences in their original order.
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "had",
  "has", "have", "he", "her", "his", "in", "into", "is", "it", "its", "of",
  "on", "or", "our", "she", "so", "that", "the", "their", "there", "they",
  "this", "to", "was", "we", "were", "with", "you", "your",
]);

const SUMMARY_SENTENCE_COUNT = 4;
// Short fragments (citation entries, dates, nav crumbs) tend to repeat a
// single rare-ish word and no stopwords, which spikes their per-word-average
// score above genuine prose. Requiring a minimum length keeps those out.
const MIN_SENTENCE_WORDS = 6;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function significantWords(sentence: string): string[] {
  return (sentence.toLowerCase().match(/[a-z']+/g) ?? []).filter((word) => !STOPWORDS.has(word));
}

function wordFrequencies(sentences: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of significantWords(sentence)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  return freq;
}

export function summarizeContent(text: string): string {
  const rawSentences = splitSentences(text);
  const longEnough = rawSentences.filter(
    (sentence) => sentence.split(/\s+/).filter(Boolean).length >= MIN_SENTENCE_WORDS,
  );
  const candidates = longEnough.length >= SUMMARY_SENTENCE_COUNT ? longEnough : rawSentences;

  // Trailing content (references, related links, footers) is rarely the
  // article's substance regardless of site, so only the first ~60% of
  // qualifying sentences are eligible - biases toward the lead/body.
  const poolSize = Math.max(SUMMARY_SENTENCE_COUNT, Math.ceil(candidates.length * 0.6));
  const sentences = candidates.slice(0, poolSize);

  if (sentences.length <= SUMMARY_SENTENCE_COUNT) {
    return sentences.join(" ");
  }

  const freq = wordFrequencies(sentences);
  const scored = sentences.map((sentence, index) => {
    const words = significantWords(sentence);
    const score = words.reduce((sum, word) => sum + (freq.get(word) ?? 0), 0) / (words.length || 1);
    return { sentence, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, SUMMARY_SENTENCE_COUNT)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence)
    .join(" ");
}
