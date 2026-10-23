import type { ReactNode } from 'react';

export type BannerTone = 'warning' | 'error' | 'success';

export interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  /** 오른쪽에 붙는 버튼 등. */
  actions?: ReactNode;
}

export function Banner({ tone, children, actions }: BannerProps) {
  return (
    <div className={`gat-banner gat-banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="gat-banner__body">{children}</div>
      {actions && <div className="gat-banner__actions">{actions}</div>}
    </div>
  );
}
