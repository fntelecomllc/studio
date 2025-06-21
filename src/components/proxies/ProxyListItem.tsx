
"use client";

import React from 'react';
import type { Proxy, ProxyStatus } from '@/lib/types';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit3, Trash2, TestTubeDiagonal, PowerOff, AlertCircle, CheckCircle, Clock, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ProxyListItemProps {
  proxy: Proxy;
  onEdit: (proxy: Proxy) => void;
  onDelete: (proxy: Proxy) => void;
  onTest: (proxyId: string) => void;
  onToggleStatus: (proxy: Proxy, newStatus: 'Active' | 'Disabled') => void;
  isLoading?: boolean;
}

const getStatusBadgeInfo = (status: ProxyStatus): { variant: "default" | "secondary" | "destructive" | "outline", icon: React.ReactElement, text: string } => {
  switch (status) {
    case 'Active':
      return { variant: 'default', icon: <CheckCircle className="h-3.5 w-3.5 text-green-500" />, text: 'Active' };
    case 'Disabled':
      return { variant: 'secondary', icon: <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />, text: 'Disabled' };
    case 'Testing':
      return { variant: 'outline', icon: <Clock className="h-3.5 w-3.5 text-blue-500 animate-spin" />, text: 'Testing' };
    case 'Failed':
      return { variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5 text-destructive" />, text: 'Failed' };
    default:
      return { variant: 'outline', icon: <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />, text: status };
  }
};

export default function ProxyListItem({ proxy, onEdit, onDelete, onTest, onToggleStatus, isLoading }: ProxyListItemProps): React.ReactElement {
  const statusInfo = getStatusBadgeInfo(proxy.status as ProxyStatus);

  const handleToggle = (checked: boolean): void => {
    onToggleStatus(proxy, checked ? 'Active' : 'Disabled');
  };
  
  const canBeEnabled = proxy.status === 'Disabled' || proxy.status === 'Failed';
  const canBeDisabled = proxy.status === 'Active' || proxy.status === 'Testing';


  return (
    <TableRow className={cn(isLoading !== false && "opacity-50 pointer-events-none")}>
      <TableCell>
        <div className="font-medium truncate max-w-xs" title={proxy.address}>{proxy.address}</div>
        {proxy.notes !== undefined && proxy.notes !== null && <div className="text-xs text-muted-foreground truncate max-w-xs" title={proxy.notes}>{proxy.notes}</div>}
      </TableCell>
      <TableCell><Badge variant="outline">{proxy.protocol}</Badge></TableCell>
      <TableCell>
        <Badge variant={statusInfo.variant} className="text-xs">
          {statusInfo.icon}
          <span className="ml-1">{statusInfo.text}</span>
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {proxy.lastTested !== undefined && proxy.lastTested !== null ? format(new Date(proxy.lastTested), 'PPp') : 'Never'}
      </TableCell>
      <TableCell className="text-xs">
        <span className="text-green-600">{proxy.successCount}</span> / <span className="text-red-600">{proxy.failureCount}</span>
      </TableCell>
      <TableCell className="text-xs text-destructive truncate max-w-[150px]" title={proxy.lastError}>
        {proxy.lastError !== undefined && proxy.lastError !== null && proxy.lastError !== '' ? proxy.lastError : 'None'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
           <Switch
            checked={proxy.status === 'Active' || proxy.status === 'Testing'}
            onCheckedChange={handleToggle}
            disabled={isLoading !== false || !(canBeEnabled !== false || canBeDisabled !== false) || proxy.status === 'Testing'}
            aria-label={`Toggle proxy ${proxy.address} status`}
            className={cn(
               (proxy.status === 'Active' || proxy.status === 'Testing') ? "data-[state=checked]:bg-green-500" : "data-[state=unchecked]:bg-muted-foreground/50",
            )}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(proxy)} disabled={isLoading}>
                <Edit3 className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTest(proxy.id)} disabled={isLoading}>
                <TestTubeDiagonal className="mr-2 h-4 w-4" /> Test
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(proxy)} className="text-destructive focus:text-destructive-foreground focus:bg-destructive" disabled={isLoading}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
