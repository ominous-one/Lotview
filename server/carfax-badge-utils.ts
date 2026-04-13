export function normalizeCarfaxBadgeLabel(rawBadge: string | null | undefined): string | null {
  const trimmed = (rawBadge || '').trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (normalized === 'one owner' || normalized === 'oneowner' || normalized === '1 owner' || normalized === 'single owner') {
    return 'One Owner';
  }
  if (
    normalized === 'no reported accidents' ||
    normalized === 'no accidents reported' ||
    normalized === 'accident free' ||
    normalized === 'accidentfree' ||
    normalized === 'no accident'
  ) {
    return 'No Reported Accidents';
  }
  if (normalized === 'service history' || normalized === 'servicehistory' || normalized === 'service records') {
    return 'Service History';
  }
  if (normalized === 'low kilometers' || normalized === 'low kilometer' || normalized === 'lowkilometer' || normalized === 'low kilometers') {
    return 'Low Kilometers';
  }

  return trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function normalizeCarfaxBadgeList(rawBadges: Array<string | null | undefined> | null | undefined): string[] {
  return Array.from(
    new Set(
      (rawBadges || [])
        .map((badge) => normalizeCarfaxBadgeLabel(badge))
        .filter((badge): badge is string => !!badge),
    ),
  );
}
