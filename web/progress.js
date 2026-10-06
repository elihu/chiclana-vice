// localStorage puede contener JSON válido de otra versión o una estructura alterada.
export function normalizeProgress(value, limits) {
  const stored = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    cash: Number.isFinite(stored.cash) && stored.cash >= 0 ? stored.cash : limits.cash,
    job:
      Number.isInteger(stored.job) && stored.job >= 0 && stored.job <= limits.jobs ? stored.job : 0,
    found: Array.isArray(stored.found)
      ? [
          ...new Set(
            stored.found.filter((id) => Number.isInteger(id) && id >= 0 && id < limits.places),
          ),
        ]
      : [],
    quality: stored.quality === 'low' ? 'low' : 'auto',
  };
}

export function readProgress(storage, limits) {
  try {
    return normalizeProgress(
      JSON.parse((typeof storage === 'function' ? storage() : storage).getItem(limits.key)),
      limits,
    );
  } catch {
    return normalizeProgress(null, limits);
  }
}
