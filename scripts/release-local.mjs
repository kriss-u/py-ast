#!/usr/bin/env node
/**
 * Load environment variables from .env file and run semantic-release
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnvFile() {
  const envPath = join(__dirname, '..', '.env');
  
  if (!existsSync(envPath)) {
    console.log('📄 No .env file found. Make sure to set NPM_TOKEN and GITHUB_TOKEN environment variables.');
    return;
  }
  
  try {
    const envContent = readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      }
    }
    
    console.log('✅ Loaded environment variables from .env file');
  } catch (error) {
    console.error('❌ Error loading .env file:', error.message);
  }
}

function runSemanticRelease(isDryRun = false) {
  loadEnvFile();
  
  // Check if required tokens are available
  if (!process.env.NPM_TOKEN) {
    console.error('❌ NPM_TOKEN is not set');
  }
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is not set');
  }
  
  if (!process.env.NPM_TOKEN || !process.env.GITHUB_TOKEN) {
    console.log('\n📋 To get tokens:');
    console.log('1. NPM token: npm login && npm token create --type=automation');
    console.log('2. GitHub token: https://github.com/settings/tokens (needs repo permissions)');
    console.log('3. Add them to .env file (copy from .env.example)');
    process.exit(1);
  }
  
  const args = ['semantic-release'];
  if (isDryRun) {
    args.push('--dry-run');
  }
  
  console.log(`🚀 Running semantic-release${isDryRun ? ' (dry-run)' : ''}...`);
  
  const child = spawn('npx', args, {
    stdio: 'inherit',
    env: process.env
  });
  
  child.on('close', (code) => {
    process.exit(code);
  });
}

// Check command line arguments
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
runSemanticRelease(isDryRun);
