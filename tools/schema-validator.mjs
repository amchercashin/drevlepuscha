/** Deliberately small JSON Schema subset, for this kit only. No remote refs. */
const keywords = new Set(['$schema','$id','$defs','$ref','title','description','type','properties',
  'required','additionalProperties','items','minItems','maxItems','minLength','pattern',
  'minimum','maximum','exclusiveMinimum','exclusiveMaximum','enum','const','anyOf','uniqueItems']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function assertSupported(schema) {
  if (!record(schema)) throw new TypeError('Schema must be an object.');
  for (const key of Object.keys(schema)) if (!keywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
  for (const group of ['properties','$defs']) if (schema[group]) Object.values(schema[group]).forEach(assertSupported);
  if (schema.items) assertSupported(schema.items);
  if (schema.anyOf) schema.anyOf.forEach(assertSupported);
  if ('additionalProperties' in schema && typeof schema.additionalProperties !== 'boolean') throw new Error('Only boolean additionalProperties is supported.');
  if (schema.$ref && !schema.$ref.startsWith('#/$defs/')) throw new Error('Only local $defs references are supported.');
}
// Canonicalize object key order: JSON Schema equality does not depend on insertion order.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function validate(schema, value) {
  assertSupported(schema);
  const errors = [];
  const root = schema;
  function walk(s, v, path, out) {
    if (s.$ref) {
      const name = s.$ref.slice('#/$defs/'.length);
      const target = root.$defs?.[name];
      if (!target) throw new Error(`Missing schema ref: ${s.$ref}`);
      walk(target, v, path, out);
    }
    if (s.anyOf) {
      if (!s.anyOf.some(branch => { const a=[];walk(branch,v,path,a);return a.length===0; })) out.push(`${path}: no anyOf branch matches`);
    }
    if ('const' in s && JSON.stringify(v)!==JSON.stringify(s.const)) out.push(`${path}: wrong constant`);
    if (s.enum && !s.enum.some(x=>JSON.stringify(v)===JSON.stringify(x))) out.push(`${path}: outside enum`);
    const matches = { object:record(v),array:Array.isArray(v),string:typeof v==='string',
      number:typeof v==='number'&&Number.isFinite(v),integer:Number.isSafeInteger(v),
      boolean:typeof v==='boolean',null:v===null };
    if (s.type && !Object.hasOwn(matches,s.type)) throw new Error(`Unsupported type: ${s.type}`);
    if (s.type && !matches[s.type]) { out.push(`${path}: expected ${s.type}`);return; }
    if (record(v)) {
      for (const k of s.required??[]) if (!Object.hasOwn(v,k)) out.push(`${path}.${k}: required`);
      if (s.additionalProperties===false) for (const k of Object.keys(v)) if (!Object.hasOwn(s.properties??{},k)) out.push(`${path}.${k}: unexpected`);
      for (const [k,child] of Object.entries(s.properties??{})) if (Object.hasOwn(v,k)) walk(child,v[k],`${path}.${k}`,out);
    }
    if (Array.isArray(v)) {
      if (s.uniqueItems && new Set(v.map(x => JSON.stringify(canonical(x)))).size !== v.length) out.push(`${path}: duplicate items`);
      if (s.minItems!==undefined&&v.length<s.minItems) out.push(`${path}: too few items`);
      if (s.maxItems!==undefined&&v.length>s.maxItems) out.push(`${path}: too many items`);
      if (s.items) v.forEach((x,i)=>walk(s.items,x,`${path}[${i}]`,out));
    }
    if (typeof v==='string') {
      if (s.minLength!==undefined&&[...v].length<s.minLength) out.push(`${path}: too short`);
      if (s.pattern&&!new RegExp(s.pattern,'u').test(v)) out.push(`${path}: pattern mismatch`);
    }
    if (typeof v==='number') {
      if (!Number.isFinite(v)) out.push(`${path}: nonfinite number`);
      for (const [key,bad] of [['minimum',v<s.minimum],['maximum',v>s.maximum],['exclusiveMinimum',v<=s.exclusiveMinimum],['exclusiveMaximum',v>=s.exclusiveMaximum]]) if (s[key]!==undefined&&bad) out.push(`${path}: violates ${key}`);
    }
  }
  walk(schema,value,'$',errors);
  return errors;
}
