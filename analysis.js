/** No word-frequency stage guesses or forced interruptions. */
export function detectNarrativeStage() { return "unknown"; }
export function analyzeNarrativePacing(history) { return { hint: "", dominantTone: "unknown", messageCount: Array.isArray(history) ? history.length : null }; }
export function detectUnresolvedThreads() { return ""; }
export async function runAnalysisInWorker(history) { return { pacing: analyzeNarrativePacing(history), threads: "" }; }
