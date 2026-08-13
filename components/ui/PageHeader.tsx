import { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

/** Consistent page header used across the whole app. */
export default function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div className="page-header-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
