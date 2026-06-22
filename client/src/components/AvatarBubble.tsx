import { User } from 'lucide-react';

export const FRAME_COLORS: Record<string, string> = {
  none: 'rgba(255,255,255,0.2)',
  gold: '#ffd700',
  silver: '#bdc3c7',
  bronze: '#cd7f32',
  blue: '#3498db',
  red: '#e74c3c',
  purple: '#9b59b6',
  green: '#27ae60',
};

export function dicebearUrl(seed: string) {
  return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
}

interface Props {
  avatarSeed?: string;
  avatarFrame?: string;
  size?: number;
}

export function AvatarBubble({ avatarSeed, avatarFrame = 'none', size = 36 }: Props) {
  const color = FRAME_COLORS[avatarFrame] ?? FRAME_COLORS.none;
  const glow = avatarFrame === 'none' ? 'none' : `0 0 8px ${color}88`;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        boxShadow: glow,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.06)',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      {avatarSeed ? (
        <img
          src={dicebearUrl(avatarSeed)}
          alt="avatar"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <User size={size * 0.5} color="#555" />
      )}
    </div>
  );
}
