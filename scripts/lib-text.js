/*
 * lib-text.js - turning model output into the plain prose the site stores.
 *
 * Split out of update-forks.js, which was 1,466 lines and had become the file
 * every change had to be squeezed into: three separate edits this week were paid
 * for by folding unrelated logging together, which is a bad reason to change
 * code. Extracted first because two modules need it - the article writer and the
 * embedding text builder - and a shared helper is the clearest possible seam.
 */
'use strict';

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => code.trim() + '\n\n')
    .replace(/```([\s\S]*?)```/g, (_, code) => code.trim() + '\n\n')
    // Remove malformed code blocks (double/single backticks at line start)
    .replace(/^`{1,3}\w*\s*$/gm, '')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove inline code (but keep the text inside)
    .replace(/`([^`]+)`/g, '$1')
    // Remove any remaining backticks
    .replace(/`/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ========== EMBEDDING PIPELINE ==========
//
// Embeds each repo's metadata once, caches the vector, then derives two things
// the Code Graph consumes: a 3D UMAP position per repo (semantic map layout) and
// top-K cosine nearest neighbors (similarity links).
//
// The cache is keyed by a hash of (model + embed text), so a repo whose
// description or summary changes is automatically re-embedded, while an unchanged
// repo costs nothing on later runs.

module.exports = { stripMarkdown };
