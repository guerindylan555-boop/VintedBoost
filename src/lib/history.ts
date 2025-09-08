export type HistoryItem = {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
};

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem("vintedboost_history");
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem("vintedboost_history", JSON.stringify(items));
  } catch {}
}

export function addHistory(item: HistoryItem) {
  const items = [item, ...loadHistory()].slice(0, 50);
  saveHistory(items);
  return items;
}

export function removeHistory(id: string) {
  const items = loadHistory().filter((i) => i.id !== id);
  saveHistory(items);
  return items;
}
