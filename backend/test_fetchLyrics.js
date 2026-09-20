import { fetchLyrics } from './lib/lyrics.js';

async function main() {
  const result = await fetchLyrics('See Tinh', 'Hoang Thuy Linh');
  console.log('Result for See Tinh, Hoang Thuy Linh:', result ? result.id : null);
  
  const result2 = await fetchLyrics('See Tình', 'Hoàng Thùy Linh');
  console.log('Result for See Tình, Hoàng Thùy Linh:', result2 ? result2.id : null);
  
  const result3 = await fetchLyrics('Hong Thuy Linh - See Tinh', 'Unknown');
  console.log('Result for Hong Thuy Linh - See Tinh, Unknown:', result3 ? result3.id : null);
}

main().catch(console.error);
