import { NextRequest, NextResponse } from 'next/server';

// This is a hidden database API endpoint for the database GUI
// Only accessible to authenticated users with proper session

interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  executionTime: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate request
    const xRequestedWith = request.headers.get('X-Requested-With');
    if (xRequestedWith !== 'XMLHttpRequest') {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    // Get the SQL query from request body
    const { query } = await request.json();
    
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'SQL query is required' },
        { status: 400 }
      );
    }

    // Basic security check - prevent obviously dangerous queries
    const queryLower = query.toLowerCase().trim();
    const dangerousPatterns = [
      'drop table',
      'drop database',
      'drop schema',
      'truncate table',
      'delete from auth.users',
      'update auth.users',
      'insert into auth.users'
    ];

    const isDangerous = dangerousPatterns.some(pattern => 
      queryLower.includes(pattern)
    );

    if (isDangerous) {
      return NextResponse.json(
        { error: 'Query contains potentially dangerous operations' },
        { status: 403 }
      );
    }

    // Forward the request to the backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    
    // Get session cookies to forward authentication
    const cookies = request.headers.get('cookie');
    
    const startTime = Date.now();
    
    const response = await fetch(`${backendUrl}/api/v2/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies && { 'Cookie': cookies })
      },
      body: JSON.stringify({ query })
    });

    const executionTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText || 'Database query failed' },
        { status: response.status }
      );
    }

    const result = await response.json();
    
    // Add execution time to result
    const queryResult: QueryResult = {
      ...result,
      executionTime
    };

    return NextResponse.json(queryResult);

  } catch (error) {
    console.error('Database query error:', error);
    return NextResponse.json(
      { error: 'Internal server error executing query' },
      { status: 500 }
    );
  }
}