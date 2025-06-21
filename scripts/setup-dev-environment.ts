#!/usr/bin/env ts-node

/**
 * Development Environment Setup Script
 * Automates the setup of a new development environment for DomainFlow
 * 
 * Features:
 * - Checks system requirements
 * - Installs dependencies
 * - Sets up environment variables
 * - Configures git hooks
 * - Validates the setup
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as _os from 'os';
import chalk from 'chalk';

interface SystemRequirement {
  name: string;
  command: string;
  minVersion?: string;
  required: boolean;
}

class DevSetup {
  private projectRoot: string;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
  }

  async run() {
    console.log(chalk.blue.bold('\n🚀 DomainFlow Development Environment Setup\n'));

    // Check system requirements
    console.log(chalk.yellow('📋 Checking system requirements...'));
    await this.checkSystemRequirements();

    // Install dependencies
    console.log(chalk.yellow('\n📦 Installing dependencies...'));
    await this.installDependencies();

    // Setup environment
    console.log(chalk.yellow('\n⚙️  Setting up environment...'));
    await this.setupEnvironment();

    // Configure git hooks
    console.log(chalk.yellow('\n🔧 Configuring git hooks...'));
    await this.setupGitHooks();

    // Validate setup
    console.log(chalk.yellow('\n✅ Validating setup...'));
    await this.validateSetup();

    // Display results
    this.displayResults();
  }

  private async checkSystemRequirements() {
    const requirements: SystemRequirement[] = [
      { name: 'Node.js', command: 'node --version', minVersion: '18.0.0', required: true },
      { name: 'npm', command: 'npm --version', minVersion: '8.0.0', required: true },
      { name: 'Git', command: 'git --version', required: true },
      { name: 'TypeScript', command: 'tsc --version', required: false },
      { name: 'Docker', command: 'docker --version', required: false },
    ];

    for (const req of requirements) {
      try {
        const output = execSync(req.command, { encoding: 'utf8' }).trim();
        console.log(chalk.green(`✓ ${req.name}: ${output}`));

        if (req.minVersion) {
          const version = this.extractVersion(output);
          if (version && this.compareVersions(version, req.minVersion) < 0) {
            const msg = `${req.name} version ${version} is below minimum required ${req.minVersion}`;
            if (req.required) {
              this.errors.push(msg);
            } else {
              this.warnings.push(msg);
            }
          }
        }
      } catch {
        const msg = `${req.name} is not installed`;
        if (req.required) {
          this.errors.push(msg);
          console.log(chalk.red(`✗ ${msg}`));
        } else {
          this.warnings.push(msg);
          console.log(chalk.yellow(`⚠ ${msg} (optional)`));
        }
      }
    }
  }

  private async installDependencies() {
    try {
      // Install npm dependencies
      console.log('Installing npm packages...');
      execSync('npm install', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });

      // Install additional dev tools
      console.log('\nInstalling additional dev tools...');
      const devTools = [
        '@typescript-eslint/eslint-plugin',
        '@typescript-eslint/parser',
        'prettier',
        'husky',
        'lint-staged',
        'commitizen',
        'cz-conventional-changelog'
      ];

      execSync(`npm install --save-dev ${devTools.join(' ')}`, { 
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      console.log(chalk.green('✓ Dependencies installed successfully'));
    } catch {
      this.errors.push('Failed to install dependencies');
      console.log(chalk.red('✗ Failed to install dependencies'));
    }
  }

  private async setupEnvironment() {
    const envPath = path.join(this.projectRoot, '.env.local');
    const envExamplePath = path.join(this.projectRoot, '.env.example');
    
    // Create .env.example if it doesn't exist
    if (!fs.existsSync(envExamplePath)) {
      const envExample = `# DomainFlow Environment Variables

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_API_TIMEOUT=30000

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Monitoring
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_ENABLE_MONITORING=true
NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITORING=true

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_PUBLIC_WS_RECONNECT_INTERVAL=5000
NEXT_PUBLIC_WS_MAX_RECONNECT_ATTEMPTS=10

# Feature Flags
NEXT_PUBLIC_FEATURE_ADVANCED_MONITORING=true
NEXT_PUBLIC_FEATURE_A_B_TESTING=false

# Development
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_ENABLE_DEBUG_LOGGING=true
`;
      fs.writeFileSync(envExamplePath, envExample);
      console.log(chalk.green('✓ Created .env.example'));
    }

    // Create .env.local if it doesn't exist
    if (!fs.existsSync(envPath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log(chalk.green('✓ Created .env.local from .env.example'));
      this.warnings.push('Please update .env.local with your actual configuration values');
    } else {
      console.log(chalk.green('✓ .env.local already exists'));
    }

    // Create necessary directories
    const directories = [
      'logs',
      'coverage',
      '.husky',
      'scripts/generated'
    ];

    for (const dir of directories) {
      const dirPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(chalk.green(`✓ Created directory: ${dir}`));
      }
    }
  }

  private async setupGitHooks() {
    try {
      // Initialize husky
      execSync('npx husky install', { 
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      // Create pre-commit hook
      const preCommitHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run linting
npm run lint

# Run type checking
npm run type-check

# Run tests for changed files
npm run test:changed
`;

      const preCommitPath = path.join(this.projectRoot, '.husky/pre-commit');
      fs.writeFileSync(preCommitPath, preCommitHook);
      fs.chmodSync(preCommitPath, '755');

      // Create commit-msg hook for conventional commits
      const commitMsgHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Validate commit message format
npx commitlint --edit $1
`;

      const commitMsgPath = path.join(this.projectRoot, '.husky/commit-msg');
      fs.writeFileSync(commitMsgPath, commitMsgHook);
      fs.chmodSync(commitMsgPath, '755');

      // Create commitlint config
      const commitlintConfig = {
        extends: ['@commitlint/config-conventional'],
        rules: {
          'type-enum': [
            2,
            'always',
            [
              'feat',
              'fix',
              'docs',
              'style',
              'refactor',
              'perf',
              'test',
              'chore',
              'revert'
            ]
          ]
        }
      };

      fs.writeFileSync(
        path.join(this.projectRoot, 'commitlint.config.js'),
        `module.exports = ${JSON.stringify(commitlintConfig, null, 2)}`
      );

      console.log(chalk.green('✓ Git hooks configured'));
    } catch {
      this.warnings.push('Failed to setup git hooks');
      console.log(chalk.yellow('⚠ Failed to setup git hooks'));
    }
  }

  private async validateSetup() {
    // Run basic validation commands
    const validations = [
      { name: 'TypeScript compilation', command: 'npm run type-check' },
      { name: 'ESLint', command: 'npm run lint' },
      { name: 'Unit tests', command: 'npm test -- --passWithNoTests' }
    ];

    for (const validation of validations) {
      try {
        execSync(validation.command, { 
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
        console.log(chalk.green(`✓ ${validation.name} passed`));
      } catch {
        this.warnings.push(`${validation.name} failed`);
        console.log(chalk.yellow(`⚠ ${validation.name} failed`));
      }
    }
  }

  private extractVersion(versionString: string): string | null {
    const match = versionString.match(/(\d+\.\d+\.\d+)/);
    return match && match[1] ? match[1] : null;
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }

  private displayResults() {
    console.log(chalk.blue.bold('\n📊 Setup Summary\n'));

    if (this.errors.length === 0) {
      console.log(chalk.green.bold('✅ Development environment setup completed successfully!\n'));
    } else {
      console.log(chalk.red.bold('❌ Setup completed with errors:\n'));
      this.errors.forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
    }

    if (this.warnings.length > 0) {
      console.log(chalk.yellow.bold('\n⚠️  Warnings:\n'));
      this.warnings.forEach(warning => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    console.log(chalk.blue.bold('\n🚀 Next Steps:\n'));
    console.log('  1. Update .env.local with your configuration');
    console.log('  2. Start the development server: npm run dev');
    console.log('  3. Open http://localhost:3000 in your browser');
    console.log('  4. Check the monitoring dashboard for real-time metrics');
    console.log(`\n${  chalk.gray('For more information, see the documentation at docs/')}`);
  }
}

// Run the setup
if (require.main === module) {
  const setup = new DevSetup();
  setup.run().catch(error => {
    console.error(chalk.red('\n❌ Setup failed:'), error);
    process.exit(1);
  });
}

export { DevSetup };