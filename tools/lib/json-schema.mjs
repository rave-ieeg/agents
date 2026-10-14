// A small JSON Schema checker covering the keywords the Agent Plugins 1.0
// schemas use (tools/schemas/), so the checks need nothing but Node.
// checkSchema() returns one "<path>: <problem>" string per problem, or an
// empty list when the value is valid.

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function hasType(value, type) {
  switch (type) {
    case 'object': return isObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number';
    case 'integer': return Number.isInteger(value);
    case 'null': return value === null;
    default: throw new Error(`unsupported schema type "${type}"`);
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) { throw new Error(`unsupported $ref "${ref}"`); }
  return ref.slice(2).split('/').reduce((node, key) => node[key], root);
}

// Keywords this checker implements, plus annotations that need no check.
// Anything else is refused: ignoring it would pass values the schema rejects.
const KEYWORDS = new Set([
  '$schema', '$id', '$comment', '$defs', 'title', 'description', 'default', 'examples',
  '$ref', 'type', 'const', 'enum', 'pattern', 'minLength', 'maxLength', 'items',
  'properties', 'required', 'additionalProperties', 'propertyNames', 'not', 'oneOf',
]);

export function checkSchema(schema, value, root = schema, path = '') {
  const unsupported = Object.keys(schema).filter((keyword) => !KEYWORDS.has(keyword));
  if (unsupported.length) { throw new Error(`unsupported JSON Schema keyword: ${unsupported.join(', ')}`); }
  const at = path || '/';
  if (schema.$ref) { return checkSchema(resolveRef(root, schema.$ref), value, root, path); }

  const errors = [];
  if ('const' in schema && !same(schema.const, value)) {
    errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((option) => same(option, value))) {
    errors.push(`${at}: must be one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type && !hasType(value, schema.type)) {
    errors.push(`${at}: must be of type ${schema.type}`);
    return errors;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) { errors.push(`${at}: shorter than ${schema.minLength}`); }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) { errors.push(`${at}: longer than ${schema.maxLength}`); }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) { errors.push(`${at}: does not match ${schema.pattern}`); }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => errors.push(...checkSchema(schema.items, item, root, `${path}/${i}`)));
  }

  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) { errors.push(`${path}/${key}: required`); }
    }
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}/${key}`;
      if (schema.propertyNames && checkSchema(schema.propertyNames, key, root, itemPath).length) {
        errors.push(`${itemPath}: property name not allowed`);
      }
      if (schema.properties && key in schema.properties) {
        errors.push(...checkSchema(schema.properties[key], item, root, itemPath));
      } else if (schema.additionalProperties === false) {
        errors.push(`${itemPath}: unexpected property`);
      } else if (isObject(schema.additionalProperties)) {
        errors.push(...checkSchema(schema.additionalProperties, item, root, itemPath));
      }
    }
  }

  if (schema.not && checkSchema(schema.not, value, root, path).length === 0) {
    errors.push(`${at}: matches a schema it must not match`);
  }
  if (schema.oneOf) {
    const matched = schema.oneOf.filter((option) => checkSchema(option, value, root, path).length === 0).length;
    if (matched !== 1) { errors.push(`${at}: must match exactly one oneOf schema (matched ${matched})`); }
  }
  return errors;
}
