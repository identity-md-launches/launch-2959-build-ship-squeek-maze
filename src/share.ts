import type { BoardIdentity } from './api';

export type RunResult = {
  board: BoardIdentity;
  score: number;
  collected: number;
  hits: number;
  sweeps: number;
  modifiersObserved: boolean;
};

export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function resultCounts(result: Pick<RunResult, 'collected' | 'hits'>, separator = ' · ') {
  return `${countLabel(result.collected, 'Squeek')}${separator}${countLabel(result.hits, 'bump')}`;
}

export function resultText(result: RunResult) {
  return `Squeek Maze Sprint · ${result.score} points in 60 seconds\n${resultCounts(result)}\n${result.board.mode === 'demo' ? 'Offline demo' : `Round #${result.board.round} · ${result.board.chain}`}\n${result.board.mode === 'live' && !result.modifiersObserved ? 'Wheel signal unavailable during this run\n' : ''}Play the maze: ${location.href.split('#')[0]}`;
}

// Canvas creates a real PNG file suitable for saving or a native share sheet.
export async function resultCard(result: RunResult): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser. Use Copy result.');
  ctx.fillStyle = '#111619'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#f4d45c'; ctx.fillRect(40, 40, 8, 550);
  ctx.font = '32px "Silkscreen", monospace'; ctx.fillText('Squeek Maze Sprint', 80, 100);
  ctx.fillStyle = '#eef2ef'; ctx.font = '96px "Silkscreen", monospace'; ctx.fillText(String(result.score), 80, 260);
  ctx.font = '24px system-ui, sans-serif'; ctx.fillStyle = '#a8b4b7'; ctx.fillText('points in 60 seconds', 85, 310);
  ctx.fillStyle = '#eef2ef'; ctx.font = '32px system-ui, sans-serif'; ctx.fillText(resultCounts(result, '  /  '), 80, 395);
  ctx.fillStyle = '#6bddda'; ctx.font = '24px system-ui, sans-serif';
  ctx.fillText(result.board.mode === 'demo' ? 'Offline demo · no live chain data' : `Round #${result.board.round} · ${result.board.chain} · Squeekchain`, 80, 465);
  ctx.fillStyle = '#a8b4b7'; ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(result.board.hash ? `Settlement anchor: ${result.board.hash}` : 'Practice board. Scores stay on this device.', 80, 520);
  ctx.fillText('Game points only. Observe the wheel. Let the hamster be.', 80, 565);
  // Distinctive pixel maze and hamster, drawn without external images.
  ctx.fillStyle = '#2c3a3e';
  const walls = ['11111111111','10001010001','11101010101','10000000101','10111011101','10100000101','10101110101','10001000001','11111111111'];
  walls.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') ctx.fillRect(810 + x * 26, 138 + y * 26, 22, 22); }));
  ctx.fillStyle = '#f4d45c'; [[1,1],[3,3],[7,3],[5,5],[9,7]].forEach(([x,y]) => ctx.fillRect(817 + x*26,145 + y*26,7,7));
  ctx.fillStyle = '#dca477'; ctx.fillRect(918,242,47,38); ctx.fillRect(918,232,12,12); ctx.fillRect(952,232,12,12);
  ctx.fillStyle = '#f5dfbd'; ctx.fillRect(931,254,22,22); ctx.fillStyle = '#111619'; ctx.fillRect(929,249,5,5); ctx.fillRect(951,249,5,5);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create the image. Use Copy result.')), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
