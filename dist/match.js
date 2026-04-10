const STOP_WORDS = new Set([
    "the", "a", "an", "is", "was", "are", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must",
    "at", "in", "on", "of", "to", "for", "by", "with", "from", "into",
    "about", "as", "up", "out", "if", "or", "and", "but", "not", "no",
    "so", "that", "this", "it", "its", "all", "any", "each", "than",
    "when", "then", "also", "just", "more", "now", "new", "use", "set"
]);
const ERROR_CODE_PATTERN = /^(?:[A-Z][a-zA-Z]*(?:Error|Exception|Fault)|E[A-Z]{2,}|[A-Z_]{3,}|\d{3})$/;
function tokenize(text) {
    return text
        .toLowerCase()
        .split(/[\s/\\:;,.!?()[\]{}"'`|=+<>#@&*~^]+/)
        .map((t) => t.replace(/^[-_]+|[-_]+$/g, ""))
        .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}
function extractErrorCodes(text) {
    return text
        .split(/[\s/\\:;,.!?()[\]{}"'`|=+<>#@&*~^]+/)
        .filter((t) => ERROR_CODE_PATTERN.test(t));
}
function scoreHighlight(errorTokens, errorCodes, highlight) {
    if (!errorTokens.length)
        return 0;
    const highlightTokens = tokenize(highlight);
    const highlightCodes = extractErrorCodes(highlight);
    const errorSet = new Set(errorTokens);
    const overlap = highlightTokens.filter((t) => errorSet.has(t)).length;
    let score = overlap / errorTokens.length;
    const sharedCodes = errorCodes.filter((c) => highlightCodes.some((hc) => hc.toLowerCase() === c.toLowerCase()));
    if (sharedCodes.length > 0) {
        score += 0.3;
    }
    return Math.min(score, 1);
}
function confidenceLevel(score) {
    if (score >= 0.7)
        return "high";
    if (score >= 0.5)
        return "medium";
    if (score >= 0.3)
        return "low";
    return undefined;
}
export function matchChangelogToError(error, highlights) {
    const errorText = `${error.message ?? ""} ${error.code ?? ""}`;
    const errorTokens = [...new Set(tokenize(errorText))];
    const errorCodes = extractErrorCodes(errorText);
    if (!errorTokens.length || !highlights.length)
        return undefined;
    const scored = highlights.map((h) => ({
        highlight: h,
        score: scoreHighlight(errorTokens, errorCodes, h)
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const confidence = confidenceLevel(best.score);
    if (!confidence)
        return undefined;
    const matchedHighlights = scored
        .filter((s) => confidenceLevel(s.score) != null)
        .map((s) => s.highlight);
    const recommendation = confidence === "high"
        ? `Upstream release likely fixes this error. Matched: "${best.highlight}"`
        : confidence === "medium"
            ? `Upstream release may address this issue. Related: "${best.highlight}"`
            : `Upstream release has potentially related changes: "${best.highlight}"`;
    return {
        confidence,
        score: best.score,
        matchedHighlights,
        recommendation
    };
}
