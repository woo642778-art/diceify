import type { SavedIntelligenceRecommendationV63 } from "./types";

const STORAGE_KEY = "diceify:intelligence:v1";

export function loadSavedIntelligenceV63(): SavedIntelligenceRecommendationV63[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SavedIntelligenceRecommendationV63 => entry?.schemaVersion === 1 && typeof entry?.id === "string");
  } catch {
    return [];
  }
}

export function saveIntelligenceRecommendationV63(entry: SavedIntelligenceRecommendationV63) {
  const current = loadSavedIntelligenceV63().filter((candidate) => candidate.id !== entry.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...current].slice(0, 20)));
}

export function deleteSavedIntelligenceV63(id: string) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loadSavedIntelligenceV63().filter((entry) => entry.id !== id)));
}
