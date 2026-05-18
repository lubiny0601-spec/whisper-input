import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
  glassy?: boolean;
  className?: string;
}

export function Card({ children, style, padding = 18, glassy = false, className }: CardProps) {
  return (
    <section
      className={['ol-card', className].filter(Boolean).join(' ')}
      style={{
        background: glassy ? 'rgba(255,255,255,0.55)' : 'var(--ol-surface)',
        backdropFilter: glassy ? 'blur(20px) saturate(160%)' : undefined,
        WebkitBackdropFilter: glassy ? 'blur(20px) saturate(160%)' : undefined,
        border: '0.5px solid var(--ol-line)',
        borderRadius: 'var(--ol-r-lg)',
        padding,
        boxShadow: 'var(--ol-shadow-sm)',
        ...style,
      }}
    >
      {children}
    </section>
  );
}
