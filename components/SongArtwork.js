import Image from 'next/image';
import { Music } from 'lucide-react';

/** Thumbnails are already sized by YouTube's CDN; no server proxy is needed. */
export default function SongArtwork({ src, title, width = 40, height = 30, style }) {
  const layout = { width, height, borderRadius: 4, objectFit: 'cover', flexShrink: 0, ...style };
  return src ? <Image src={src} alt={title || ''} width={width} height={height} unoptimized style={layout} /> :
    <div style={{ ...layout, background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={16} color="var(--text-muted)" /></div>;
}
