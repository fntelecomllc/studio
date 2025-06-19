#!/usr/bin/env python3
"""
TypeScript 'any' Type Replacement Script
Systematically replaces 'any' types with more appropriate TypeScript types
"""

import os
import re
import argparse
from pathlib import Path
from typing import List, Tuple, Dict

class TypeScriptAnyReplacer:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.changes_made = 0
        self.files_processed = 0
        
        # Common replacement patterns
        self.replacements = [
            # Function parameters and return types
            (r'\(value: any\)', '(value: unknown)'),
            (r'=> any\b', '=> unknown'),
            (r': any\[\]', ': unknown[]'),
            (r': any\s*=', ': unknown ='),
            
            # Object types
            (r'Record<string, any>', 'Record<string, unknown>'),
            (r'Record<\w+, any>', lambda m: m.group(0).replace('any', 'unknown')),
            
            # Generic constraints
            (r'<T extends any>', '<T>'),
            (r'<T = any>', '<T = unknown>'),
            
            # Array types
            (r'Array<any>', 'Array<unknown>'),
            (r'any\[\]', 'unknown[]'),
            
            # Function types - be more careful here
            (r'\(.*?: any\) => any', lambda m: m.group(0).replace('any', 'unknown')),
            
            # Variable declarations
            (r'const \w+: any\b', lambda m: m.group(0).replace('any', 'unknown')),
            (r'let \w+: any\b', lambda m: m.group(0).replace('any', 'unknown')),
            (r'var \w+: any\b', lambda m: m.group(0).replace('any', 'unknown')),
            
            # Property types
            (r':\s*any(?=\s*[;,}])', ': unknown'),
            
            # Type assertions - be more careful
            (r'as any(?=\s*[;,.\)]))', 'as unknown'),
        ]
        
        # Context-specific replacements for better type safety
        self.context_replacements = {
            'validator': [
                (r'\(v: any\)', '(v: unknown)'),
                (r'\(value: any\)', '(value: unknown)'),
            ],
            'error_handler': [
                (r'catch \((\w+): any\)', r'catch (\1: unknown)'),
                (r'error: any', 'error: unknown'),
            ],
            'api_response': [
                (r'response: any', 'response: unknown'),
                (r'data: any', 'data: unknown'),
            ],
            'test_file': [
                # In tests, we can be more permissive but still improve
                (r'expect\(.*?: any\)', lambda m: m.group(0).replace('any', 'unknown')),
            ]
        }
        
        # Files to exclude (where 'any' might be intentional)
        self.exclude_patterns = [
            r'\.d\.ts$',  # Type definition files
            r'node_modules/',
            r'\.git/',
            r'dist/',
            r'build/',
        ]
        
        # Patterns where 'any' should be preserved
        self.preserve_patterns = [
            r'// @ts-ignore.*any',  # Explicitly ignored
            r'// eslint-disable.*any',  # ESLint disabled
            r'JSON\.parse\(.*\): any',  # JSON.parse often needs any
            r'window\.\w+.*: any',  # Window object extensions
        ]

    def should_exclude_file(self, file_path: str) -> bool:
        """Check if file should be excluded from processing"""
        for pattern in self.exclude_patterns:
            if re.search(pattern, file_path):
                return True
        return False

    def should_preserve_line(self, line: str) -> bool:
        """Check if a line should preserve 'any' types"""
        for pattern in self.preserve_patterns:
            if re.search(pattern, line):
                return True
        return False

    def get_file_context(self, file_path: str) -> str:
        """Determine the context of the file for targeted replacements"""
        path_lower = file_path.lower()
        
        if 'test' in path_lower or 'spec' in path_lower:
            return 'test_file'
        elif 'validator' in path_lower or 'validation' in path_lower:
            return 'validator'
        elif 'api' in path_lower and ('client' in path_lower or 'response' in path_lower):
            return 'api_response'
        elif 'error' in path_lower or 'exception' in path_lower:
            return 'error_handler'
        
        return 'general'

    def process_line(self, line: str, file_context: str) -> Tuple[str, int]:
        """Process a single line and return modified line and change count"""
        if self.should_preserve_line(line):
            return line, 0
        
        original_line = line
        changes = 0
        
        # Apply context-specific replacements first
        if file_context in self.context_replacements:
            for pattern, replacement in self.context_replacements[file_context]:
                if callable(replacement):
                    new_line = re.sub(pattern, replacement, line)
                else:
                    new_line = re.sub(pattern, replacement, line)
                if new_line != line:
                    line = new_line
                    changes += 1
        
        # Apply general replacements
        for pattern, replacement in self.replacements:
            try:
                if callable(replacement):
                    new_line = re.sub(pattern, replacement, line)
                else:
                    new_line = re.sub(pattern, replacement, line)
                if new_line != line:
                    line = new_line
                    changes += 1
            except re.error as e:
                print(f"Warning: Regex error with pattern '{pattern}': {e}")
                continue
        
        return line, changes

    def process_file(self, file_path: str) -> bool:
        """Process a single TypeScript file"""
        if self.should_exclude_file(file_path):
            return False
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except (UnicodeDecodeError, IOError) as e:
            print(f"Warning: Could not read {file_path}: {e}")
            return False
        
        file_context = self.get_file_context(file_path)
        modified_lines = []
        file_changes = 0
        
        for line_num, line in enumerate(lines, 1):
            modified_line, line_changes = self.process_line(line, file_context)
            modified_lines.append(modified_line)
            file_changes += line_changes
            
            if line_changes > 0 and not self.dry_run:
                print(f"  Line {line_num}: {line.strip()} -> {modified_line.strip()}")
        
        if file_changes > 0:
            if self.dry_run:
                print(f"[DRY RUN] Would modify {file_path}: {file_changes} changes")
            else:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.writelines(modified_lines)
                print(f"Modified {file_path}: {file_changes} changes")
            
            self.changes_made += file_changes
            return True
        
        return False

    def find_typescript_files(self, directory: str) -> List[str]:
        """Find all TypeScript files in directory"""
        ts_files = []
        
        for root, dirs, files in os.walk(directory):
            # Skip excluded directories
            dirs[:] = [d for d in dirs if not any(re.search(pattern, os.path.join(root, d)) for pattern in self.exclude_patterns)]
            
            for file in files:
                if file.endswith(('.ts', '.tsx')) and not file.endswith('.d.ts'):
                    file_path = os.path.join(root, file)
                    if not self.should_exclude_file(file_path):
                        ts_files.append(file_path)
        
        return sorted(ts_files)

    def run(self, directories: List[str]) -> None:
        """Run the replacement process on specified directories"""
        all_files = []
        
        for directory in directories:
            if os.path.isfile(directory):
                all_files.append(directory)
            else:
                all_files.extend(self.find_typescript_files(directory))
        
        print(f"Found {len(all_files)} TypeScript files to process")
        
        if self.dry_run:
            print("=== DRY RUN MODE - No files will be modified ===")
        
        files_modified = 0
        
        for file_path in all_files:
            self.files_processed += 1
            if self.process_file(file_path):
                files_modified += 1
        
        print(f"\nSummary:")
        print(f"  Files processed: {self.files_processed}")
        print(f"  Files modified: {files_modified}")
        print(f"  Total changes: {self.changes_made}")
        
        if self.dry_run:
            print(f"\nRun without --dry-run to apply changes")

def main():
    parser = argparse.ArgumentParser(description='Replace TypeScript any types with more specific types')
    parser.add_argument('paths', nargs='+', help='Directories or files to process')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be changed without modifying files')
    parser.add_argument('--exclude', action='append', help='Additional exclude patterns (regex)')
    
    args = parser.parse_args()
    
    replacer = TypeScriptAnyReplacer(dry_run=args.dry_run)
    
    # Add custom exclude patterns
    if args.exclude:
        replacer.exclude_patterns.extend(args.exclude)
    
    try:
        replacer.run(args.paths)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())
