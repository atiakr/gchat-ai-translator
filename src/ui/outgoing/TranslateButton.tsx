import { t } from '../../i18n/t';

export interface TranslateButtonProps {
  onClick: () => void;
}

/** 입력창 옆 둥근 아이콘 버튼. 글리프는 인라인 SVG(외부 자산 없음). */
export function TranslateButton({ onClick }: TranslateButtonProps) {
  const title = t('outgoing_buttonTitle');
  return (
    <button
      type="button"
      className="gat-translate-btn"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
      </svg>
    </button>
  );
}
