// Hand-crafted embedding vectors for kNN tests.
//
// All vectors have the dims of `embeddings.vector` in the articles / replies
// mappings. `queryVector` is the unit vector along the first axis, so a vector
// `[cos, sin, 0, ...]` has exactly the cosine similarity `cos` to it.
//
// Usage:
//
// createEmbedding.mockResolvedValue([{ vector: queryVector }]);
// fixture = { ..., embeddings: [{ vector: vectorWithSimilarity(0.85) }] };
//

export const EMBEDDING_DIMS = 768;

/** The query vector the vectors below are measured against */
export const queryVector = vectorWithSimilarity(1);

/**
 * @param {number} similarity - cosine similarity to `queryVector`, in [-1, 1]
 * @returns {number[]} a unit vector with the given cosine similarity to `queryVector`
 */
export function vectorWithSimilarity(similarity) {
  const vector = Array(EMBEDDING_DIMS).fill(0);
  vector[0] = similarity;
  vector[1] = Math.sqrt(1 - similarity * similarity);
  return vector;
}
