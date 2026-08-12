import { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Friendly empty state — use whenever a list or table has no data. */
export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="empty-state surface">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
