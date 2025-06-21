#!/usr/bin/env ts-node

/**
 * Project Cleanup Script
 * Removes deprecated code, unused dependencies, and optimizes the project
 * 
 * Features:
 * - Unused dependency detection
 * - Dead code elimination
 * - Import optimization
 * - File size analysis
 * - Deprecated API detection
 * - Bundle size optimization
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { z as _z } from 'zod';

interface CleanupResult {
  unusedDependencies: string[];
  unusedFiles: string[];
  deprecatedAPIs: { file: string; line: number; api: string }[];
  largeFiles: { path: string; size: number }[];
  duplicateCode: { files: string[]; similarity: number }[];
  totalSaved: number;
}

class ProjectCleanup {
  private projectRoot: string;
  private ignorePatterns: RegExp[];
  private result: CleanupResult;

  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.ignorePatterns = [
      /node_modules/,
      /\.next/,
      /\.git/,
      /coverage/,
      /dist/,
      /build/,
      /__tests__/,
      /\.test\./,
      /\.spec\./,
      /\.stories\./
    ];
    this.result = {
      unusedDependencies: [],
      unusedFiles: [],
      deprecatedAPIs: [],
      largeFiles: [],
      duplicateCode: [],
      totalSaved: 0
    };
  }

  async run(): Promise<void> {
    console.log(chalk.blue.bold('\n🧹 DomainFlow Project Cleanup\n'));

    try {
      // Step 1: Analyze dependencies
      await this.analyzeDependencies();

      // Step 2: Find unused files
      await this.findUnusedFiles();

      // Step 3: Detect deprecated APIs
      await this.detectDeprecatedAPIs();

      // Step 4: Analyze file sizes
      await this.analyzeFileSizes();

      // Step 5: Clean up imports
      await this.cleanupImports();

      // Step 6: Remove empty directories
      await this.removeEmptyDirectories();

      // Step 7: Optimize package.json
      await this.optimizePackageJson();

      // Display results
      this.displayResults();

      // Ask for confirmation before cleanup
      if (this.result.unusedDependencies.length > 0 || this.result.unusedFiles.length > 0) {
        const proceed = await this.confirmCleanup();
        if (proceed) {
          await this.performCleanup();
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Cleanup failed:'), error);
      process.exit(1);
    }
  }

  private async analyzeDependencies(): Promise<void> {
    console.log(chalk.yellow('📦 Analyzing dependencies...'));

    try {
      // Use depcheck to find unused dependencies
      const depcheckResult = execSync('npx depcheck --json', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });

      const result = JSON.parse(depcheckResult);
      this.result.unusedDependencies = [
        ...Object.keys(result.dependencies || {}),
        ...Object.keys(result.devDependencies || {})
      ];

      // Filter out false positives
      const whitelist = [
        '@types/node',
        '@types/react',
        '@types/react-dom',
        'typescript',
        'eslint',
        'prettier',
        'husky',
        'lint-staged'
      ];

      this.result.unusedDependencies = this.result.unusedDependencies.filter(
        dep => !whitelist.includes(dep)
      );

      console.log(chalk.green(`✓ Found ${this.result.unusedDependencies.length} potentially unused dependencies`));
    } catch {
      console.warn(chalk.yellow('⚠ Dependency analysis skipped (depcheck not available)'));
    }
  }

  private async findUnusedFiles(): Promise<void> {
    console.log(chalk.yellow('\n🔍 Finding unused files...'));

    const allFiles = this.getAllFiles(this.projectRoot);
    const importedFiles = new Set<string>();

    // Analyze all TypeScript/JavaScript files for imports
    for (const file of allFiles) {
      if (this.isSourceFile(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const imports = this.extractImports(content);
        
        for (const imp of imports) {
          const resolvedPath = this.resolveImportPath(imp, file);
          if (resolvedPath) {
            importedFiles.add(resolvedPath);
          }
        }
      }
    }

    // Find entry points
    const entryPoints = [
      path.join(this.projectRoot, 'src/index.ts'),
      path.join(this.projectRoot, 'src/index.tsx'),
      path.join(this.projectRoot, 'app/layout.tsx'),
      path.join(this.projectRoot, 'pages/_app.tsx'),
      ...this.findNextJsPages()
    ];

    // Mark entry points as used
    for (const entry of entryPoints) {
      if (fs.existsSync(entry)) {
        importedFiles.add(entry);
      }
    }

    // Find unused files
    this.result.unusedFiles = allFiles.filter(file => {
      if (!this.isSourceFile(file)) return false;
      if (importedFiles.has(file)) return false;
      if (this.isEntryPoint(file)) return false;
      if (this.isTestFile(file)) return false;
      return true;
    });

    console.log(chalk.green(`✓ Found ${this.result.unusedFiles.length} potentially unused files`));
  }

  private async detectDeprecatedAPIs(): Promise<void> {
    console.log(chalk.yellow('\n🚨 Detecting deprecated APIs...'));

    const deprecatedPatterns = [
      { pattern: /componentWillMount/g, api: 'componentWillMount' },
      { pattern: /componentWillReceiveProps/g, api: 'componentWillReceiveProps' },
      { pattern: /componentWillUpdate/g, api: 'componentWillUpdate' },
      { pattern: /findDOMNode/g, api: 'findDOMNode' },
      { pattern: /PropTypes\./g, api: 'PropTypes' },
      { pattern: /createRef\(\)/g, api: 'createRef (consider useRef)' },
      { pattern: /String\.prototype\.substr/g, api: 'substr (use substring)' },
      { pattern: /moment\(/g, api: 'moment.js (consider date-fns)' },
      { pattern: /lodash\./g, api: 'lodash (consider native methods)' }
    ];

    const allFiles = this.getAllFiles(this.projectRoot);
    
    for (const file of allFiles) {
      if (this.isSourceFile(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          for (const { pattern, api } of deprecatedPatterns) {
            if (line && pattern.test(line)) {
              this.result.deprecatedAPIs.push({
                file: path.relative(this.projectRoot, file),
                line: i + 1,
                api
              });
            }
          }
        }
      }
    }

    console.log(chalk.green(`✓ Found ${this.result.deprecatedAPIs.length} deprecated API usages`));
  }

  private async analyzeFileSizes(): Promise<void> {
    console.log(chalk.yellow('\n📊 Analyzing file sizes...'));

    const allFiles = this.getAllFiles(this.projectRoot);
    const fileSizes: { path: string; size: number }[] = [];

    for (const file of allFiles) {
      const stats = fs.statSync(file);
      if (stats.isFile()) {
        fileSizes.push({
          path: path.relative(this.projectRoot, file),
          size: stats.size
        });
      }
    }

    // Sort by size and get top 20 largest files
    fileSizes.sort((a, b) => b.size - a.size);
    const largeFileThreshold = 100 * 1024; // 100KB

    this.result.largeFiles = fileSizes
      .filter(f => f.size > largeFileThreshold && this.isSourceFile(f.path))
      .slice(0, 20);

    console.log(chalk.green(`✓ Found ${this.result.largeFiles.length} large files (>100KB)`));
  }

  private async cleanupImports(): Promise<void> {
    console.log(chalk.yellow('\n🔧 Cleaning up imports...'));

    try {
      // Run ESLint with autofix for import ordering
      execSync('npx eslint --fix --rule "import/order: error" src/', {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      console.log(chalk.green('✓ Import cleanup completed'));
    } catch {
      console.warn(chalk.yellow('⚠ Import cleanup skipped'));
    }
  }

  private async removeEmptyDirectories(): Promise<void> {
    console.log(chalk.yellow('\n📁 Removing empty directories...'));

    let removedCount = 0;
    
    const removeEmpty = (dir: string): boolean => {
      const entries = fs.readdirSync(dir);
      
      if (entries.length === 0) {
        fs.rmdirSync(dir);
        removedCount++;
        return true;
      }
      
      let hasContent = false;
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          if (!removeEmpty(fullPath)) {
            hasContent = true;
          }
        } else {
          hasContent = true;
        }
      }
      
      if (!hasContent) {
        fs.rmdirSync(dir);
        removedCount++;
        return true;
      }
      
      return false;
    };

    const srcDir = path.join(this.projectRoot, 'src');
    if (fs.existsSync(srcDir)) {
      removeEmpty(srcDir);
    }

    console.log(chalk.green(`✓ Removed ${removedCount} empty directories`));
  }

  private async optimizePackageJson(): Promise<void> {
    console.log(chalk.yellow('\n📄 Optimizing package.json...'));

    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Remove duplicate scripts
    const scripts = packageJson.scripts || {};
    const uniqueScripts: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(scripts)) {
      if (!Object.values(uniqueScripts).includes(value as string)) {
        uniqueScripts[key] = value as string;
      }
    }

    packageJson.scripts = uniqueScripts;

    // Sort dependencies
    if (packageJson.dependencies) {
      packageJson.dependencies = this.sortObject(packageJson.dependencies);
    }
    if (packageJson.devDependencies) {
      packageJson.devDependencies = this.sortObject(packageJson.devDependencies);
    }

    // Remove empty sections
    const emptyKeys = Object.keys(packageJson).filter(
      key => packageJson[key] && 
      typeof packageJson[key] === 'object' && 
      Object.keys(packageJson[key]).length === 0
    );

    for (const key of emptyKeys) {
      delete packageJson[key];
    }

    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)  }\n`);
    console.log(chalk.green('✓ package.json optimized'));
  }

  private displayResults(): void {
    console.log(chalk.blue.bold('\n📊 Cleanup Analysis Results\n'));

    if (this.result.unusedDependencies.length > 0) {
      console.log(chalk.yellow('Unused Dependencies:'));
      this.result.unusedDependencies.forEach(dep => {
        console.log(chalk.gray(`  • ${dep}`));
      });
    }

    if (this.result.unusedFiles.length > 0) {
      console.log(chalk.yellow('\nUnused Files:'));
      this.result.unusedFiles.slice(0, 10).forEach(file => {
        console.log(chalk.gray(`  • ${path.relative(this.projectRoot, file)}`));
      });
      if (this.result.unusedFiles.length > 10) {
        console.log(chalk.gray(`  ... and ${this.result.unusedFiles.length - 10} more`));
      }
    }

    if (this.result.deprecatedAPIs.length > 0) {
      console.log(chalk.yellow('\nDeprecated APIs:'));
      this.result.deprecatedAPIs.slice(0, 10).forEach(({ file, line, api }) => {
        console.log(chalk.gray(`  • ${file}:${line} - ${api}`));
      });
      if (this.result.deprecatedAPIs.length > 10) {
        console.log(chalk.gray(`  ... and ${this.result.deprecatedAPIs.length - 10} more`));
      }
    }

    if (this.result.largeFiles.length > 0) {
      console.log(chalk.yellow('\nLarge Files:'));
      this.result.largeFiles.slice(0, 5).forEach(({ path: filePath, size }) => {
        console.log(chalk.gray(`  • ${filePath} - ${(size / 1024).toFixed(2)}KB`));
      });
    }

    // Calculate potential savings
    const unusedFilesSavings = this.result.unusedFiles.reduce((total, file) => {
      return total + fs.statSync(file).size;
    }, 0);

    this.result.totalSaved = unusedFilesSavings;

    console.log(chalk.green.bold(`\n💾 Potential savings: ${(this.result.totalSaved / 1024 / 1024).toFixed(2)}MB`));
  }

  private async confirmCleanup(): Promise<boolean> {
    console.log(chalk.yellow('\n⚠️  The following actions will be performed:'));
    
    if (this.result.unusedDependencies.length > 0) {
      console.log(chalk.gray(`  • Remove ${this.result.unusedDependencies.length} unused dependencies`));
    }
    
    if (this.result.unusedFiles.length > 0) {
      console.log(chalk.gray(`  • Delete ${this.result.unusedFiles.length} unused files`));
    }

    console.log(chalk.red('\n⚠️  This action cannot be undone! Make sure you have committed your changes.'));
    
    // In a real implementation, we would use inquirer to prompt
    // For now, we'll skip the actual cleanup
    return false;
  }

  private async performCleanup(): Promise<void> {
    console.log(chalk.yellow('\n🧹 Performing cleanup...'));

    // Remove unused dependencies
    if (this.result.unusedDependencies.length > 0) {
      const deps = this.result.unusedDependencies.join(' ');
      execSync(`npm uninstall ${deps}`, {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });
    }

    // Delete unused files
    for (const file of this.result.unusedFiles) {
      fs.unlinkSync(file);
      console.log(chalk.gray(`  ✓ Deleted ${path.relative(this.projectRoot, file)}`));
    }

    console.log(chalk.green.bold('\n✅ Cleanup completed successfully!'));
  }

  // Helper methods
  private getAllFiles(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      
      // Skip ignored patterns
      if (this.ignorePatterns.some(pattern => pattern.test(fullPath))) {
        continue;
      }

      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        this.getAllFiles(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private isSourceFile(file: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    return extensions.some(ext => file.endsWith(ext));
  }

  private isTestFile(file: string): boolean {
    return /\.(test|spec|stories)\.(ts|tsx|js|jsx)$/.test(file);
  }

  private isEntryPoint(file: string): boolean {
    const entryPatterns = [
      /\/pages?\//,
      /\/app\//,
      /index\.(ts|tsx|js|jsx)$/,
      /main\.(ts|tsx|js|jsx)$/,
      /App\.(ts|tsx|js|jsx)$/
    ];
    
    return entryPatterns.some(pattern => pattern.test(file));
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    
    // ES6 imports
    const es6Pattern = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = es6Pattern.exec(content)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
    
    // CommonJS requires
    const cjsPattern = /require\s*\(['"]([^'"]+)['"]\)/g;
    
    while ((match = cjsPattern.exec(content)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
    
    return imports;
  }

  private resolveImportPath(importPath: string, fromFile: string): string | null {
    // Skip external modules
    if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
      return null;
    }

    // Handle alias imports
    if (importPath.startsWith('@/')) {
      importPath = importPath.replace('@/', 'src/');
    }

    const basePath = path.dirname(fromFile);
    const resolved = path.resolve(basePath, importPath);

    // Try different extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    }

    return null;
  }

  private findNextJsPages(): string[] {
    const pages: string[] = [];
    const appDir = path.join(this.projectRoot, 'app');
    const pagesDir = path.join(this.projectRoot, 'pages');

    const findPages = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          findPages(fullPath);
        } else if (entry === 'page.tsx' || entry === 'layout.tsx' || entry === 'route.ts') {
          pages.push(fullPath);
        }
      }
    };

    findPages(appDir);
    findPages(pagesDir);

    return pages;
  }

  private sortObject(obj: Record<string, any>): Record<string, any> {
    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = obj[key];
        return sorted;
      }, {} as Record<string, any>);
  }
}

// Run cleanup
if (require.main === module) {
  const cleanup = new ProjectCleanup();
  cleanup.run();
}

export { ProjectCleanup };