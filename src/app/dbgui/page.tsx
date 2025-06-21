'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// Only import icons that are actually used in the component
import { Database, Server } from 'lucide-react';

interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  executionTime: number;
}

interface DatabaseStats {
  totalTables: number;
  totalUsers: number;
  totalSessions: number;
  databaseSize: string;
  schemaVersion: string;
}

export default function DatabaseGUI(): React.ReactElement {
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM auth.users LIMIT 10;');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);

  // Database credentials
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });

  // Simple authentication function
  const authenticate = async (): Promise<void> => {
    if (credentials.username.length === 0 || credentials.password.length === 0) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8080/api/v2/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: credentials.username,
          password: credentials.password
        }),
      });

      if (response.ok) {
        setAuthSuccess(true);
        setConnectionStatus('connected');
        void loadDatabaseStats();
      } else {
        setError('Login failed. Please check your credentials.');
        setConnectionStatus('error');
      }
    } catch (_err) {
      setError('Connection error. Please try again.');
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // Load database statistics
  const loadDatabaseStats = async (): Promise<void> => {
    try {
      const response = await fetch('http://localhost:8080/api/database/stats', {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const stats = await response.json() as DatabaseStats;
        setDbStats(stats);
      }
    } catch (err) {
      console.error('Failed to load database stats:', err);
    }
  };

  // Execute SQL query
  const executeQuery = async (): Promise<void> => {
    if (sqlQuery.trim().length === 0) return;

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8080/api/database/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ query: sqlQuery }),
      });

      const result = await response.json() as QueryResult | { error?: string };

      if (response.ok) {
        setQueryResult(result as QueryResult);
      } else {
        setError((result as { error?: string }).error ?? 'Query execution failed');
      }
    } catch (_err) {
      setError('Network error executing query');
    } finally {
      setLoading(false);
    }
  };

  // Predefined queries
  const predefinedQueries = [
    {
      name: 'User Overview',
      query: 'SELECT email, first_name, last_name, is_active, created_at FROM auth.users ORDER BY created_at DESC;'
    },
    {
      name: 'Active Sessions',
      query: 'SELECT s.id, u.email, s.ip_address, s.last_activity_at, s.expires_at FROM auth.sessions s JOIN auth.users u ON s.user_id = u.id WHERE s.is_active = true ORDER BY s.last_activity_at DESC;'
    },
    {
      name: 'Schema Tables',
      query: `SELECT schemaname, tablename, tableowner FROM pg_tables WHERE schemaname IN ('auth', 'public') ORDER BY schemaname, tablename;`
    },
    {
      name: 'Database Size',
      query: `SELECT pg_size_pretty(pg_database_size(current_database())) as database_size, pg_size_pretty(pg_total_relation_size('auth.users')) as users_table_size;`
    },
    {
      name: 'Permission Summary',
      query: 'SELECT r.name as role, COUNT(rp.permission_id) as permission_count FROM auth.roles r LEFT JOIN auth.role_permissions rp ON r.id = rp.role_id GROUP BY r.name ORDER BY permission_count DESC;'
    }
  ];


  if (authSuccess === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-blue-600 p-3 rounded-lg">
                <Database className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">DomainFlow</h1>
            <p className="text-gray-400">Database Administration Console</p>
          </div>

          {/* Login Card */}
          <Card className="bg-white/10 backdrop-blur-md border-gray-700">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl text-white text-center">
                Sign In
              </CardTitle>
              <CardDescription className="text-gray-300 text-center">
                Enter your credentials to access the database console
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-white">Email Address</Label>
                  <Input
                    id="username"
                    type="email"
                    placeholder="Enter your email"
                    value={credentials.username}
                    onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                    className="bg-white/5 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    className="bg-white/5 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-400"
                    onKeyPress={(e) => { if (e.key === 'Enter') void authenticate(); }}
                  />
                </div>
              </div>

              <Button
                onClick={() => void authenticate()}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-medium"
              >
                {loading === true ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Authenticating...
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>

              {error !== null && (
                <Alert className="bg-red-500/10 border-red-500/20">
                  <AlertDescription className="text-red-400">{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-gray-500 text-sm">
              Enterprise Database Console v2.0
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Sidebar - Database Tree */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-gray-900">DomainFlow DB</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">domainflow_production</div>
        </div>
        
        {/* Database Tree */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {/* Auth Schema */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium text-gray-700">
                <Server className="h-4 w-4" />
                <span>auth schema</span>
              </div>
              <div className="ml-6 space-y-1">
                {['users', 'sessions', 'roles', 'permissions', 'user_roles', 'role_permissions', 'auth_audit_log', 'password_reset_tokens', 'rate_limits'].map((table) => (
                  <div
                    key={table}
                    className="flex items-center gap-2 px-2 py-1 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer rounded"
                    onClick={() => { setSqlQuery(`SELECT * FROM auth.${table} LIMIT 50;`); }}
                  >
                    <div className="h-4 w-4 flex items-center justify-center">
                      <div className="h-2 w-2 bg-blue-500 rounded-sm"></div>
                    </div>
                    <span>{table}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Public Schema */}
            <div className="space-y-1 mt-4">
              <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium text-gray-700">
                <Server className="h-4 w-4" />
                <span>public schema</span>
              </div>
              <div className="ml-6 space-y-1">
                {['campaigns', 'generated_domains', 'personas', 'keyword_sets', 'proxies', 'dns_validation_results', 'http_keyword_results', 'audit_logs', 'campaign_jobs'].map((table) => (
                  <div
                    key={table}
                    className="flex items-center gap-2 px-2 py-1 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer rounded"
                    onClick={() => { setSqlQuery(`SELECT * FROM public.${table} LIMIT 50;`); }}
                  >
                    <div className="h-4 w-4 flex items-center justify-center">
                      <div className="h-2 w-2 bg-green-500 rounded-sm"></div>
                    </div>
                    <span>{table}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900">Database Administration</h1>
              <Badge variant={connectionStatus === 'connected' ? 'default' : 'destructive'}>
                {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">PostgreSQL 15+</Badge>
              <Badge variant="outline">Schema v2.0</Badge>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-gray-50 border-b border-gray-200 px-6">
          <Tabs defaultValue="tables" className="w-full">
            <TabsList className="bg-transparent border-b-0">
              <TabsTrigger value="tables" className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500">
                Structure
              </TabsTrigger>
              <TabsTrigger value="sql" className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500">
                SQL
              </TabsTrigger>
              <TabsTrigger value="query" className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500">
                Query
              </TabsTrigger>
              <TabsTrigger value="export" className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500">
                Export
              </TabsTrigger>
            </TabsList>

            {/* Tables Overview */}
            <TabsContent value="tables" className="mt-0 bg-white">
              <div className="p-6">
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <Label>Filters</Label>
                      <Input placeholder="Table name..." className="w-48" />
                    </div>
                    <Button variant="outline" size="sm">Apply</Button>
                  </div>

                  {/* Tables List */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-12">
                            <input type="checkbox" className="rounded" />
                          </TableHead>
                          <TableHead>Table</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Rows</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Collation</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Overhead</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Auth Schema Tables */}
                        <TableRow className="bg-blue-50/30">
                          <TableCell colSpan={8} className="font-medium text-blue-800 bg-blue-100">
                            auth schema
                          </TableCell>
                        </TableRow>
                        {['users', 'sessions', 'roles', 'permissions', 'user_roles'].map((table) => (
                          <TableRow key={`auth-${table}`} className="hover:bg-gray-50">
                            <TableCell>
                              <input type="checkbox" className="rounded" />
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-blue-600">auth.{table}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => { setSqlQuery(`SELECT * FROM auth.${table} LIMIT 50;`); }}>
                                  Browse
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => { setSqlQuery(`\\d auth.${table}`); }}>
                                  Structure
                                </Button>
                                <Button variant="ghost" size="sm">
                                  Search
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>{Math.floor(Math.random() * 1000)}</TableCell>
                            <TableCell>PostgreSQL</TableCell>
                            <TableCell>utf8_general_ci</TableCell>
                            <TableCell>{(Math.random() * 10).toFixed(1)} KiB</TableCell>
                            <TableCell>-</TableCell>
                          </TableRow>
                        ))}
                        
                        {/* Public Schema Tables */}
                        <TableRow className="bg-green-50/30">
                          <TableCell colSpan={8} className="font-medium text-green-800 bg-green-100">
                            public schema
                          </TableCell>
                        </TableRow>
                        {['campaigns', 'generated_domains', 'personas', 'keyword_sets', 'proxies'].map((table) => (
                          <TableRow key={`public-${table}`} className="hover:bg-gray-50">
                            <TableCell>
                              <input type="checkbox" className="rounded" />
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-green-600">public.{table}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => { setSqlQuery(`SELECT * FROM public.${table} LIMIT 50;`); }}>
                                  Browse
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => { setSqlQuery(`\\d public.${table}`); }}>
                                  Structure
                                </Button>
                                <Button variant="ghost" size="sm">
                                  Search
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>{Math.floor(Math.random() * 500)}</TableCell>
                            <TableCell>PostgreSQL</TableCell>
                            <TableCell>utf8_general_ci</TableCell>
                            <TableCell>{(Math.random() * 50).toFixed(1)} KiB</TableCell>
                            <TableCell>-</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Summary */}
                  <div className="flex items-center justify-between text-sm text-gray-600 pt-4 border-t border-gray-200">
                    <div>{dbStats !== null ? `${dbStats.totalTables} tables` : '10 tables'}</div>
                    <div>Sum: {Math.floor(Math.random() * 10000)} rows | Size: {(Math.random() * 100).toFixed(1)} KiB</div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* SQL Query Tab */}
            <TabsContent value="sql" className="mt-0 bg-white">
              <div className="p-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sql-query">SQL Query</Label>
                    <Textarea
                      id="sql-query"
                      placeholder="Enter your SQL query here..."
                      value={sqlQuery}
                      onChange={(e) => setSqlQuery(e.target.value)}
                      className="min-h-[200px] font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => void executeQuery()} disabled={loading}>
                      {loading === true ? 'Executing...' : 'Execute'}
                    </Button>
                    <Button variant="outline" onClick={() => { setSqlQuery(''); }}>
                      Clear
                    </Button>
                  </div>
                  
                  {error !== null && (
                    <Alert>
                      <AlertDescription className="text-red-600">{error}</AlertDescription>
                    </Alert>
                  )}

                  {queryResult !== null && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Query Results</h3>
                        <div className="text-sm text-gray-600">
                          {queryResult.rowCount} rows • {queryResult.executionTime}ms
                        </div>
                      </div>
                      
                      <div className="border rounded-lg overflow-auto max-h-96">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {queryResult.columns.map((column, index) => (
                                <TableHead key={index} className="font-semibold">
                                  {column}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {queryResult.rows.map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                  <TableCell key={cellIndex} className="font-mono text-sm">
                                    {cell === null ? (
                                      <span className="text-gray-400 italic">NULL</span>
                                    ) : (
                                      String(cell)
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Quick Queries Tab */}
            <TabsContent value="query" className="mt-0 bg-white">
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {predefinedQueries.map((query, index) => (
                    <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{query.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs text-gray-600 mb-4 overflow-auto">
                          {query.query}
                        </pre>
                        <Button
                          onClick={() => {
                            setSqlQuery(query.query);
                          }}
                          className="w-full"
                        >
                          Load Query
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Export Tab */}
            <TabsContent value="export" className="mt-0 bg-white">
              <div className="p-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Export Database</CardTitle>
                    <CardDescription>
                      Export database structure and data in various formats
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-gray-600">
                      Export functionality would be implemented here for production use.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}