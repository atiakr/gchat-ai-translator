import type { ReactNode } from 'react';

export interface FieldProps {
  /** 입력 요소의 id. 라벨 연결에 쓴다. */
  htmlFor?: string;
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

/** 라벨 + 입력 + 도움말/오류 한 묶음. */
export function Field({ htmlFor, label, help, error, children }: FieldProps) {
  return (
    <div className="gat-field">
      <label className="gat-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="gat-field__error" role="alert">
          {error}
        </p>
      ) : (
        help && <p className="gat-field__help">{help}</p>
      )}
    </div>
  );
}
