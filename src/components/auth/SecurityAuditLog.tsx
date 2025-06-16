// src/components/auth/SecurityAuditLog.tsx
// Security audit log viewer for admin users to monitor security events
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Search,
  Calendar,
  User,
  Activity,
  Download,
  RefreshCw
} from 'lucide-react';
import type { SecurityEvent, AuditLogEntry } from '@/lib/types';

interface SecurityAuditLogProps {
  showSecurityEvents?: boolean;
  showAuditLog?: boolean;
  maxEvents?: number;
}

// Mock data - in a real app, this would come from an API
const MOCK_SECURITY_EVENTS: SecurityEvent[] = [
  {
    id: '1',
    userId: 'user1',
    eventType: 'login',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    riskScore: 1,
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
    details: { success: true, method: 'password' }
  },
  {
    id: '2',
    userId: 'user2',
    eventType: 'failed_login',
    ipAddress: '10.0.0.50',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    riskScore: 7,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    details: { reason: 'invalid_password', attempts: 3 }
  },
  {
    id: '3',
    userId: 'user1',
    eventType: 'password_change',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    riskScore: 2,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    details: { forced: false }
  },
  {
    id: '4',
    eventType: 'account_locked',
    ipAddress: '203.0.113.45',
    userAgent: 'curl/7.68.0',
    riskScore: 9,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
    details: { reason: 'too_many_failed_attempts', lockout_duration: 900 }
  }
];

const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  {
    id: '1',
    userId: 'user1',
    action: 'campaign:create',
    resource: 'campaign',
    resourceId: 'camp123',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
    details: { campaignName: 'Test Campaign', type: 'DNS Validation' }
  },
  {
    id: '2',
    userId: 'admin1',
    action: 'user:create',
    resource: 'user',
    resourceId: 'user123',
    ipAddress: '192.168.1.10',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    details: { userName: 'John Doe', email: 'john@example.com', role: 'user' }
  },
  {
    id: '3',
    userId: 'user2',
    action: 'persona:update',
    resource: 'persona',
    resourceId: 'persona456',
    ipAddress: '10.0.0.50',
    userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
    details: { personaName: 'HTTP Persona 1', changes: ['userAgent', 'headers'] }
  }
];

export function SecurityAuditLog({
  showSecurityEvents = true,
  showAuditLog = true
}: SecurityAuditLogProps) {
  const { hasPermission } = useAuth();
  
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'security' | 'audit'>('security');
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [riskLevelFilter, setRiskLevelFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if user has admin permissions
  const canViewSecurityLogs = hasPermission('security:read') || hasPermission('admin:all');

  // Load security events
  const loadSecurityEvents = useCallback(async () => {
    if (!canViewSecurityLogs) return;
    
    setIsLoading(true);
    try {
      // In a real app, this would be an API call
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
      setSecurityEvents(MOCK_SECURITY_EVENTS);
    } catch (error) {
      console.error('Load security events error:', error);
      setErrorMessage('Failed to load security events');
    } finally {
      setIsLoading(false);
    }
  }, [canViewSecurityLogs]);

  // Load audit log
  const loadAuditLog = useCallback(async () => {
    if (!canViewSecurityLogs) return;
    
    setIsLoading(true);
    try {
      // In a real app, this would be an API call
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
      setAuditLog(MOCK_AUDIT_LOG);
    } catch (error) {
      console.error('Load audit log error:', error);
      setErrorMessage('Failed to load audit log');
    } finally {
      setIsLoading(false);
    }
  }, [canViewSecurityLogs]);

  // Load data on component mount
  useEffect(() => {
    if (showSecurityEvents) {
      loadSecurityEvents();
    }
    if (showAuditLog) {
      loadAuditLog();
    }
  }, [showSecurityEvents, showAuditLog, loadSecurityEvents, loadAuditLog]);

  // Get event type badge variant
  const getEventTypeBadge = useCallback((eventType: string) => {
    switch (eventType) {
      case 'login':
        return { variant: 'default' as const, icon: CheckCircle };
      case 'logout':
        return { variant: 'secondary' as const, icon: CheckCircle };
      case 'failed_login':
        return { variant: 'destructive' as const, icon: XCircle };
      case 'password_change':
        return { variant: 'default' as const, icon: Shield };
      case 'password_reset':
        return { variant: 'secondary' as const, icon: Shield };
      case 'account_locked':
        return { variant: 'destructive' as const, icon: AlertTriangle };
      case 'session_expired':
        return { variant: 'secondary' as const, icon: AlertTriangle };
      default:
        return { variant: 'outline' as const, icon: Activity };
    }
  }, []);

  // Get risk level badge variant
  const getRiskLevelBadge = useCallback((riskScore: number) => {
    if (riskScore >= 8) return { variant: 'destructive' as const, label: 'High' };
    if (riskScore >= 5) return { variant: 'destructive' as const, label: 'Medium' };
    if (riskScore >= 3) return { variant: 'secondary' as const, label: 'Low' };
    return { variant: 'outline' as const, label: 'Minimal' };
  }, []);

  // Filter security events
  const filteredSecurityEvents = securityEvents.filter(event => {
    const matchesSearch = (event.ipAddress || '').includes(searchTerm) ||
                         (event.userAgent || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (event.userId && event.userId.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesEventType = eventTypeFilter === 'all' || event.eventType === eventTypeFilter;
    
    const matchesRiskLevel = riskLevelFilter === 'all' ||
                            (riskLevelFilter === 'high' && (event.riskScore || 0) >= 8) ||
                            (riskLevelFilter === 'medium' && (event.riskScore || 0) >= 5 && (event.riskScore || 0) < 8) ||
                            (riskLevelFilter === 'low' && (event.riskScore || 0) < 5);
    
    const matchesDate = dateFilter === 'all' || 
                       (dateFilter === 'today' && new Date(event.timestamp).toDateString() === new Date().toDateString()) ||
                       (dateFilter === 'week' && new Date(event.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) ||
                       (dateFilter === 'month' && new Date(event.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    
    return matchesSearch && matchesEventType && matchesRiskLevel && matchesDate;
  });

  // Filter audit log
  const filteredAuditLog = auditLog.filter(entry => {
    const matchesSearch = entry.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (entry.resource && entry.resource.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (entry.userId && entry.userId.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (entry.ipAddress || '').includes(searchTerm);
    
    const matchesDate = dateFilter === 'all' || 
                       (dateFilter === 'today' && new Date(entry.timestamp).toDateString() === new Date().toDateString()) ||
                       (dateFilter === 'week' && new Date(entry.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) ||
                       (dateFilter === 'month' && new Date(entry.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    
    return matchesSearch && matchesDate;
  });

  // Format date
  const formatDate = useCallback((dateString: string): string => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  // Format user agent
  const formatUserAgent = useCallback((userAgent: string): string => {
    if (userAgent.length > 50) {
      return userAgent.substring(0, 50) + '...';
    }
    return userAgent;
  }, []);

  // Export data (placeholder)
  const handleExport = useCallback(() => {
    // In a real app, this would generate and download a CSV/JSON file
    alert('Export functionality would be implemented here');
  }, []);

  if (!canViewSecurityLogs) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          You don&apos;t have permission to view security audit logs.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Shield className="h-6 w-6" />
            <span>Security Audit Log</span>
          </h2>
          <p className="text-muted-foreground">Monitor security events and user activities</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              if (activeTab === 'security') loadSecurityEvents();
              else loadAuditLog();
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      {showSecurityEvents && showAuditLog && (
        <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
          <Button
            variant={activeTab === 'security' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('security')}
          >
            <Shield className="mr-2 h-4 w-4" />
            Security Events
          </Button>
          <Button
            variant={activeTab === 'audit' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('audit')}
          >
            <Activity className="mr-2 h-4 w-4" />
            Audit Log
          </Button>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Event Type Filter (Security Events only) */}
            {(activeTab === 'security' || !showAuditLog) && (
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                  <SelectItem value="failed_login">Failed Login</SelectItem>
                  <SelectItem value="password_change">Password Change</SelectItem>
                  <SelectItem value="password_reset">Password Reset</SelectItem>
                  <SelectItem value="account_locked">Account Locked</SelectItem>
                  <SelectItem value="session_expired">Session Expired</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Risk Level Filter (Security Events only) */}
            {(activeTab === 'security' || !showAuditLog) && (
              <Select value={riskLevelFilter} onValueChange={setRiskLevelFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="low">Low Risk</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Date Filter */}
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Security Events Table */}
      {(activeTab === 'security' || !showAuditLog) && (
        <Card>
          <CardHeader>
            <CardTitle>Security Events ({filteredSecurityEvents.length})</CardTitle>
            <CardDescription>
              Monitor authentication and security-related events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : filteredSecurityEvents.length === 0 ? (
              <div className="text-center p-8">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No security events found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSecurityEvents.map((event) => {
                    const eventBadge = getEventTypeBadge(event.eventType);
                    const riskBadge = getRiskLevelBadge(event.riskScore || 0);
                    const IconComponent = eventBadge.icon;
                    
                    return (
                      <TableRow key={event.id}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <IconComponent className="h-4 w-4" />
                            <Badge variant={eventBadge.variant}>
                              {event.eventType.replace('_', ' ')}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.userId ? (
                            <div className="flex items-center space-x-1">
                              <User className="h-3 w-3" />
                              <span className="text-sm">{event.userId}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {event.ipAddress || 'N/A'}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={riskBadge.variant}>
                            {riskBadge.label} ({event.riskScore || 0})
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span className="text-sm">{formatDate(event.timestamp)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {formatUserAgent(event.userAgent || 'Unknown')}
                            </p>
                            {event.details && Object.keys(event.details).length > 0 && (
                              <div className="text-xs">
                                {Object.entries(event.details).map(([key, value]) => (
                                  <span key={key} className="mr-2">
                                    <strong>{key}:</strong> {String(value)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit Log Table */}
      {(activeTab === 'audit' || !showSecurityEvents) && (
        <Card>
          <CardHeader>
            <CardTitle>Audit Log ({filteredAuditLog.length})</CardTitle>
            <CardDescription>
              Track user actions and system changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : filteredAuditLog.length === 0 ? (
              <div className="text-center p-8">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No audit log entries found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAuditLog.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant="outline">{entry.action}</Badge>
                      </TableCell>
                      <TableCell>
                        {entry.userId ? (
                          <div className="flex items-center space-x-1">
                            <User className="h-3 w-3" />
                            <span className="text-sm">{entry.userId}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{entry.resource}</p>
                          {entry.resourceId && (
                            <p className="text-xs text-muted-foreground">{entry.resourceId}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {entry.ipAddress || 'N/A'}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span className="text-sm">{formatDate(entry.timestamp)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.details && Object.keys(entry.details).length > 0 && (
                          <div className="text-xs space-y-1">
                            {Object.entries(entry.details).map(([key, value]) => (
                              <div key={key}>
                                <strong>{key}:</strong> {String(value)}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SecurityAuditLog;