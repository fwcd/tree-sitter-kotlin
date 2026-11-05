'use strict';

const { Node } = require('./models');

const ESCAPES = { t: '\t', b: '\b', n: '\n', r: '\r', "'": "'", '"': '"', '$': '$', '\\': '\\' };
function decode(text, raw) {
  if (raw) return text;
  let value = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\') { value += text[i]; continue; }
    const escape = text[++i];
    if (escape === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) {
      value += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16)); i += 4;
    } else if (Object.hasOwn(ESCAPES, escape)) value += ESCAPES[escape];
    else return null;
  }
  return value;
}

function textNode(info, raw = false) {
  const value = decode(info.text, raw);
  if (value === null) return new Node('INVALID_ESCAPE_SEQUENCE', [], { value: info.text, start: info.start, end: info.end });
  return new Node('LITERAL_STRING_TEMPLATE_ENTRY', [], { value, start: info.start, end: info.end });
}

/** Merge only contiguous literal runs; interpolation remains a distinct node. */
function mergeRuns(children) {
  const result = [];
  for (const child of children) {
    const previous = result[result.length - 1];
    if (child.name === 'LITERAL_STRING_TEMPLATE_ENTRY' && child.literal &&
        previous?.name === child.name && previous.literal?.end === child.literal.start) {
      result[result.length - 1] = new Node(child.name, [], {
        value: previous.literal.value + child.literal.value,
        start: previous.literal.start, end: child.literal.end,
      });
    } else result.push(child);
  }
  return result;
}

module.exports = { decode, textNode, mergeRuns };
