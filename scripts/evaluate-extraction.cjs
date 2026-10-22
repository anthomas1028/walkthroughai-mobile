// Usage: node scripts/evaluate-extraction.cjs labeled-results.json
// Input: {items:[{id,expected:{part_number,description,package_quantity},predicted:{...},corrected:true}]}
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(input.items) || !input.items.length) throw new Error('Provide labeled items with stable IDs.');
const seen = new Set();
const fields = ['part_number', 'description', 'package_quantity'];
const totals = Object.fromEntries(fields.map(f => [f, {correct:0,labeled:0}]));
let missing=0, extra=0, corrected=0;
const normalize = value => String(value ?? '').trim().toUpperCase();
for (const row of input.items) {
 if (!row.id || seen.has(row.id)) throw new Error('Each item needs a unique stable ID.');
 seen.add(row.id);
 if (!row.expected) { extra++; continue; }
 if (!row.predicted) missing++;
 if (row.corrected) corrected++;
 for (const field of fields) if (Object.hasOwn(row.expected,field)) {
  totals[field].labeled++;
  if (row.predicted && normalize(row.expected[field])===normalize(row.predicted[field])) totals[field].correct++;
 }
}
for (const value of Object.values(totals)) value.exactMatchPercent=value.labeled? Math.round(value.correct/value.labeled*10000)/100:null;
console.log(JSON.stringify({items:input.items.length,missing,extra,corrected,fields:totals},null,2));
