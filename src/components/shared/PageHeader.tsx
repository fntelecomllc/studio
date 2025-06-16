
import type { LucideIcon } from 'lucide-react';
import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionButtons?: React.ReactNode;
}

export default function PageHeader({ title, description, icon: Icon, actionButtons }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-7 w-7 text-primary" />}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>
      {actionButtons && <div className="flex gap-2 self-end sm:self-auto">{actionButtons}</div>}
    </div>
  );
}
