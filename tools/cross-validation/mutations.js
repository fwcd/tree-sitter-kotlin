'use strict';
// Kotlin lexical categories shared by the v2 source mutator.
const HARD_KEYWORDS = ['as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in',
  'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try',
  'typealias', 'typeof', 'val', 'var', 'when', 'while'];
// jscpd:ignore-end
const SOFT_KEYWORDS = ['by', 'catch', 'constructor', 'delegate', 'dynamic', 'field', 'file', 'finally', 'get',
  'import', 'init', 'param', 'property', 'receiver', 'set', 'setparam', 'value', 'where', 'context', 'it'];
const MODIFIERS = ['abstract', 'actual', 'annotation', 'companion', 'const', 'crossinline', 'data', 'enum',
  'expect', 'external', 'final', 'infix', 'inline', 'inner', 'internal', 'lateinit', 'noinline', 'open',
  'operator', 'out', 'override', 'private', 'protected', 'public', 'reified', 'sealed', 'suspend', 'tailrec',
  'vararg'];

module.exports = {HARD_KEYWORDS, SOFT_KEYWORDS, MODIFIERS};
