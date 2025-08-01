#!/usr/bin/env node
/**
 * JSR Release Helper Script
 * 
 * This script helps synchronize the version from package.json to jsr.json
 * and provides guidance for manual JSR releases.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function syncVersions() {
  try {
    // Read package.json
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Read jsr.json
    const jsrPath = path.join(__dirname, '..', 'jsr.json');
    const jsrJson = JSON.parse(fs.readFileSync(jsrPath, 'utf8'));
    
    // Update jsr.json version
    jsrJson.version = packageJson.version;
    
    // Write back jsr.json
    fs.writeFileSync(jsrPath, JSON.stringify(jsrJson, null, '\t') + '\n');
    
    console.log(`✅ Synced version ${packageJson.version} to jsr.json`);
    console.log('\n📦 JSR Publishing:');
    console.log('✅ JSR is automatically published via GitHub Actions after npm release');
    console.log('🔧 Manual publish: npx jsr publish --allow-slow-types');
    console.log('🧪 Local test: npx jsr publish --dry-run --allow-slow-types');
    
    return packageJson.version;
  } catch (error) {
    console.error('❌ Error syncing versions:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  syncVersions();
}

export { syncVersions };
