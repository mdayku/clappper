#!/usr/bin/env node

/**
 * Image to PNG Converter
 * 
 * Converts AVIF, WebP, SVG, JPG, and other formats to PNG
 * Usage:
 *   node scripts/convert-to-png.js <input-file> [output-file]
 *   node scripts/convert-to-png.js <directory>  (converts all images in directory)
 * 
 * Examples:
 *   node scripts/convert-to-png.js image.webp
 *   node scripts/convert-to-png.js image.avif output.png
 *   node scripts/convert-to-png.js C:\Users\marcu\Downloads\
 *   
 * For SVG: Converts at 2000px width (suitable for AI video generation)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Supported input formats
const SUPPORTED_FORMATS = ['.avif', '.webp', '.jpg', '.jpeg', '.svg', '.gif', '.tiff', '.bmp'];

async function convertToPng(inputPath, outputPath = null) {
  try {
    // Get file info
    const ext = path.extname(inputPath).toLowerCase();
    const baseName = path.basename(inputPath, ext);
    const dirName = path.dirname(inputPath);
    
    // Generate output path if not provided
    if (!outputPath) {
      outputPath = path.join(dirName, `${baseName}.png`);
    }
    
    console.log(`Converting: ${path.basename(inputPath)}`);
    
    let sharpInstance = sharp(inputPath);
    
    // Special handling for SVG - rasterize at high resolution
    if (ext === '.svg') {
      sharpInstance = sharpInstance.resize(2000, null, {
        fit: 'inside',
        withoutEnlargement: false
      });
      console.log('  → SVG detected: Rasterizing at 2000px width');
    }
    
    // Convert to PNG with high quality
    await sharpInstance
      .png({ 
        quality: 100, 
        compressionLevel: 6,
        palette: false // Force full RGB
      })
      .toFile(outputPath);
    
    // Get file sizes
    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    
    console.log(`  ✓ Saved: ${path.basename(outputPath)}`);
    console.log(`  ✓ Size: ${formatBytes(inputSize)} → ${formatBytes(outputSize)}`);
    
    // Get dimensions
    const metadata = await sharp(outputPath).metadata();
    console.log(`  ✓ Dimensions: ${metadata.width}×${metadata.height}\n`);
    
    return outputPath;
  } catch (error) {
    console.error(`  ✗ Error converting ${path.basename(inputPath)}:`, error.message);
    throw error;
  }
}

async function convertDirectory(dirPath) {
  console.log(`\nScanning directory: ${dirPath}\n`);
  
  const files = fs.readdirSync(dirPath);
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return SUPPORTED_FORMATS.includes(ext);
  });
  
  if (imageFiles.length === 0) {
    console.log('No supported image files found.');
    console.log(`Supported formats: ${SUPPORTED_FORMATS.join(', ')}`);
    return;
  }
  
  console.log(`Found ${imageFiles.length} image(s) to convert:\n`);
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const file of imageFiles) {
    const inputPath = path.join(dirPath, file);
    try {
      const outputPath = await convertToPng(inputPath);
      results.success.push(outputPath);
    } catch (error) {
      results.failed.push({ file, error: error.message });
    }
  }
  
  // Summary
  console.log('─────────────────────────────────────────');
  console.log(`✓ Successfully converted: ${results.success.length}`);
  if (results.failed.length > 0) {
    console.log(`✗ Failed: ${results.failed.length}`);
    results.failed.forEach(({ file, error }) => {
      console.log(`  • ${file}: ${error}`);
    });
  }
  console.log('─────────────────────────────────────────\n');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function printUsage() {
  console.log(`
Image to PNG Converter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

USAGE:
  node scripts/convert-to-png.js <input-file> [output-file]
  node scripts/convert-to-png.js <directory>

EXAMPLES:
  # Convert single file (auto-generate output name)
  node scripts/convert-to-png.js image.webp
  
  # Convert with custom output name
  node scripts/convert-to-png.js logo.svg brand-logo.png
  
  # Convert all images in directory
  node scripts/convert-to-png.js C:\\Users\\marcu\\Downloads\\
  
  # Convert your specific files
  node scripts/convert-to-png.js "C:\\Users\\marcu\\Downloads\\Brooklington+89''+Upholstered+Sofa-880809770.webp"
  node scripts/convert-to-png.js "C:\\Users\\marcu\\Downloads\\smyga-bed-frame-with-storage-light-gray__1287535_pe933939_s5.avif"

SUPPORTED FORMATS:
  Input:  ${SUPPORTED_FORMATS.join(', ')}
  Output: .png (high quality, RGB)

NOTES:
  • SVG files are rasterized at 2000px width (ideal for AI video generation)
  • Output PNG files are saved in the same directory as input
  • Existing PNG files with same name will be overwritten
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }
  
  const inputPath = args[0];
  const outputPath = args[1] || null;
  
  // Check if input exists
  if (!fs.existsSync(inputPath)) {
    console.error(`\n✗ Error: File or directory not found: ${inputPath}\n`);
    process.exit(1);
  }
  
  // Check if it's a directory or file
  const stats = fs.statSync(inputPath);
  
  if (stats.isDirectory()) {
    await convertDirectory(inputPath);
  } else {
    console.log('');
    await convertToPng(inputPath, outputPath);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n✗ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { convertToPng, convertDirectory };

