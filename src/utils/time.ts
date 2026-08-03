const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function formatRelativeAge(date: Date, now = Date.now()): string {
  const days = Math.floor((now - date.getTime()) / MS_PER_DAY);

  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
