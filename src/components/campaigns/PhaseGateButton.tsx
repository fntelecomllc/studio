"use client";

import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface PhaseGateButtonProps {
  label: string;
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  isLoading?: boolean;
  Icon?: LucideIcon;
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  className?: string;
}

export default function PhaseGateButton({
  label,
  onClick,
  disabled = false,
  isLoading = false,
  Icon,
  variant = "default",
  className
}: PhaseGateButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || isLoading}
      variant={variant}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        Icon && <Icon className="mr-2 h-4 w-4" />
      )}
      {isLoading ? "Processing..." : label}
    </Button>
  );
}
