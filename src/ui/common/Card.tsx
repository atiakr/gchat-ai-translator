import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}

/** 설정 섹션 카드. */
export function Card({ title, description, compact, children }: CardProps) {
  return (
    <section className={compact ? 'gat-card gat-card--compact' : 'gat-card'}>
      {(title || description) && (
        <header className="gat-card__header">
          {title && <h2 className="gat-card__title">{title}</h2>}
          {description && <p className="gat-card__description">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
