import { formatDuration, formatNumber } from '@shared/format'

/** The three leaderboards: titles, colours and value formatting. */
export const BOARD_INFO = {
  rebirths: { title: 'Total Rebirths', color: '#ff5c8a', format: (v) => formatNumber(v) },
  playtime: { title: 'Total Playtime', color: '#4fc3ff', format: (v) => formatDuration(v * 1000) },
  distance: { title: 'Longest Slide', color: '#ffb21e', format: (v) => `${formatNumber(v)} m` },
}


/** Rows for a board: the server's top 10, or just you when offline. */
export function boardRows(leaderboards, profile, id) {
  if (leaderboards?.[id]?.length) return leaderboards[id]
  const value = id === 'rebirths' ? profile.rebirths : id === 'playtime' ? profile.stats.playtime : profile.stats.bestDistance
  return [{ name: profile.name, value }]
}
