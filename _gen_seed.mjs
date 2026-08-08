/**
 * Temporary script to generate backend/src/data/seed-suggestions.ts
 * from frontend constants. Run with: node _gen_seed.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// We'll use a simple approach: require/import won't work with TS directly,
// so we'll parse the TS files as text and extract the arrays.

const suggestionsPath = join(__dirname, 'frontend/src/constants/suggestions.ts');
const citiesPath = join(__dirname, 'frontend/src/constants/indian-cities.ts');

const suggestionsContent = readFileSync(suggestionsPath, 'utf-8');
const citiesContent = readFileSync(citiesPath, 'utf-8');

/**
 * Extract all string values from a `const NAME = [ ... ] as const;` block
 */
function extractArray(content, varName) {
  // Find the start of the array
  const patterns = [
    new RegExp(`(?:export\\s+)?const\\s+${varName}\\s*=\\s*\\[`, 'm'),
    new RegExp(`(?:export\\s+)?const\\s+${varName}\\s*:\\s*[^=]+=\\s*\\[`, 'm'),
  ];

  let startIdx = -1;
  for (const pat of patterns) {
    const m = content.match(pat);
    if (m) {
      startIdx = m.index + m[0].length;
      break;
    }
  }

  if (startIdx === -1) {
    // Check if it's an alias like LOCATION_SUGGESTIONS = INDIAN_CITIES
    const aliasMatch = content.match(new RegExp(`const\\s+${varName}\\s*[^=]*=\\s*(\\w+)\\s*;`));
    if (aliasMatch) {
      return null; // It's an alias, not an array literal
    }
    throw new Error(`Could not find array: ${varName}`);
  }

  // Find the matching closing bracket
  let depth = 1;
  let i = startIdx;
  while (i < content.length && depth > 0) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']') depth--;
    i++;
  }

  const arrayBody = content.substring(startIdx, i - 1);

  // Extract all string literals (single-quoted and double-quoted)
  const strings = [];
  const stringRegex = /(?:'([^']*(?:\\.[^']*)*)'|"([^"]*(?:\\.[^"]*)*)")/g;
  let match;
  while ((match = stringRegex.exec(arrayBody)) !== null) {
    strings.push(match[1] !== undefined ? match[1] : match[2]);
  }

  return strings;
}

/**
 * Extract ALL cities from indian-cities.ts by finding every const array
 * then combining them in the same order as the INDIAN_CITIES export.
 */
function extractAllCities(content) {
  // Find the combined export to get the order of arrays
  const exportMatch = content.match(/export\s+const\s+INDIAN_CITIES[^=]*=\s*\[([\s\S]*?)\]\s*as\s*const/);
  if (!exportMatch) throw new Error('Could not find INDIAN_CITIES export');

  const spreadBody = exportMatch[1];
  const spreadNames = [];
  const spreadRegex = /\.\.\.(\w+)/g;
  let m;
  while ((m = spreadRegex.exec(spreadBody)) !== null) {
    spreadNames.push(m[1]);
  }

  // Extract each sub-array
  const allCities = [];
  for (const name of spreadNames) {
    const cities = extractArray(content, name);
    if (cities) {
      allCities.push(...cities);
    }
  }

  return allCities;
}

// Map of frontend variable names to backend category keys
const categoryMap = [
  ['skill', 'SKILL_SUGGESTIONS'],
  ['industry', 'INDUSTRY_SUGGESTIONS'],
  ['department', 'DEPARTMENT_SUGGESTIONS'],
  ['role_category', 'ROLE_CATEGORY_SUGGESTIONS'],
  // location handled separately
  ['institution', 'INSTITUTION_SUGGESTIONS'],
  ['degree', 'DEGREE_SUGGESTIONS'],
  ['field_of_study', 'FIELD_OF_STUDY_SUGGESTIONS'],
  ['company', 'COMPANY_NAME_SUGGESTIONS'],
  ['certification', 'CERTIFICATION_SUGGESTIONS'],
  ['language', 'LANGUAGE_SUGGESTIONS'],
  ['benefit', 'BENEFIT_SUGGESTIONS'],
  ['indian_state', 'INDIAN_STATES'],
  ['visa_status', 'VISA_STATUS_OPTIONS'],
  ['volunteer_cause', 'VOLUNTEER_CAUSE_SUGGESTIONS'],
  ['hobby', 'HOBBY_SUGGESTIONS'],
  ['interest', 'INTEREST_SUGGESTIONS'],
  ['professional_org', 'PROFESSIONAL_ORGANIZATION_SUGGESTIONS'],
  ['test_score', 'TEST_SCORE_SUGGESTIONS'],
  ['sub_industry', 'SUB_INDUSTRY_SUGGESTIONS'],
  ['core_value', 'CORE_VALUE_SUGGESTIONS'],
  ['investor', 'INVESTOR_SUGGESTIONS'],
  ['product_service', 'PRODUCT_SERVICE_SUGGESTIONS'],
  ['nationality', 'NATIONALITY_SUGGESTIONS'],
  ['country', 'COUNTRY_SUGGESTIONS'],
  ['publisher', 'PUBLISHER_SUGGESTIONS'],
  ['erg', 'ERG_SUGGESTIONS'],
  ['revenue_range', 'REVENUE_RANGE_OPTIONS'],
  ['job_title', 'JOB_TITLE_SUGGESTIONS'],
];

// Extract all categories
const categories = {};

for (const [key, varName] of categoryMap) {
  const arr = extractArray(suggestionsContent, varName);
  if (!arr) {
    throw new Error(`Failed to extract ${varName}`);
  }
  categories[key] = arr;
}

// Extract locations from indian-cities.ts
categories['location'] = extractAllCities(citiesContent);

console.log('Extracted categories:');
for (const [key, arr] of Object.entries(categories)) {
  console.log(`  ${key}: ${arr.length} items`);
}

// Generate the output file
function escapeString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

let output = `/**
 * Comprehensive seed data for the Elasticsearch suggestions index.
 * Sourced from frontend static suggestions — serves as both seed data and fallback.
 *
 * AUTO-GENERATED — do not edit manually.
 * Regenerate with: node _gen_seed.mjs
 */

export const SEED_SUGGESTIONS: Record<string, readonly string[]> = {\n`;

// The order of categories in the output
const orderedKeys = [
  'skill', 'industry', 'department', 'role_category', 'location',
  'institution', 'degree', 'field_of_study', 'company', 'certification',
  'language', 'benefit', 'indian_state', 'visa_status', 'volunteer_cause',
  'hobby', 'interest', 'professional_org', 'test_score', 'sub_industry',
  'core_value', 'investor', 'product_service', 'nationality', 'country',
  'publisher', 'erg', 'revenue_range', 'job_title',
];

for (let ki = 0; ki < orderedKeys.length; ki++) {
  const key = orderedKeys[ki];
  const arr = categories[key];
  if (!arr) {
    throw new Error(`Missing category: ${key}`);
  }

  output += `  ${key}: [\n`;
  for (let i = 0; i < arr.length; i++) {
    output += `    '${escapeString(arr[i])}',\n`;
  }
  output += `  ],\n`;
  if (ki < orderedKeys.length - 1) {
    output += `\n`;
  }
}

output += `};\n`;

const outPath = join(__dirname, 'backend/src/data/seed-suggestions.ts');
writeFileSync(outPath, output, 'utf-8');

console.log(`\nWritten to: ${outPath}`);
console.log(`Total categories: ${orderedKeys.length}`);
console.log(`Total entries: ${Object.values(categories).reduce((sum, arr) => sum + arr.length, 0)}`);
