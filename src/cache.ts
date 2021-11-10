const now = Date.now();

export function set(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify({ time: now, value }));
}

export function get(key: string, cache = 0): unknown | undefined {
  const item = localStorage.getItem(key);

  if (!item) {
    return;
  }

  try {
    const { value, time } = JSON.parse(item);

    if ((time + cache) >= now) {
      return value;
    }
  } catch {
    // Ignore
  }

  remove(key);
}

export function remove(key: string) {
  localStorage.removeItem(key);
}
