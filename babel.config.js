/**
 * Jest runs the modules it transforms in a CommonJS context, but
 * `babel-preset-expo` compiles for Metro and leaves `import()` as a real dynamic
 * import. Node then rejects it with "A dynamic import callback was invoked
 * without --experimental-vm-modules".
 *
 * That rejection happens inside `src/ocr/recognize.ts`, which catches load
 * failures and reports OCR as unsupported. The effect in tests was silent: every
 * OCR path behaved as if it were running in Expo Go, so a broken fake and a
 * working one were indistinguishable.
 *
 * Rewriting `import(x)` to `require(x)` under the test environment only restores
 * the lazy load the module is written for, while letting Jest's module registry
 * and `jest.doMock` resolve it. Metro is unaffected: this plugin is only added
 * when `NODE_ENV`/`BABEL_ENV` is `test`.
 */
function dynamicImportToRequire({ types }) {
  return {
    name: 'truelabels-dynamic-import-to-require',
    visitor: {
      CallExpression(path) {
        const callee = path.node.callee;
        if (!callee || callee.type !== 'Import') return;

        const [argument] = path.node.arguments;
        // Only a literal specifier can be turned into `require` safely; a
        // computed one has to stay a dynamic import.
        if (!argument || argument.type !== 'StringLiteral') return;

        path.replaceWith(types.callExpression(types.identifier('require'), [argument]));
      },
    },
  };
}

module.exports = (api) => {
  'worklet';
  api.cache.using(() => process.env.BABEL_ENV || process.env.NODE_ENV);

  const isTest = (process.env.BABEL_ENV || process.env.NODE_ENV) === 'test';

  return {
    presets: [['babel-preset-expo']],
    plugins: [
      'react-native-reanimated/plugin',
      ...(isTest ? [dynamicImportToRequire] : []),
    ],
  };
};