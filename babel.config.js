module.exports = (api) => {
  'worklet';
  api.cache.using(() => process.env.BABEL_ENV || process.env.NODE_ENV);
  return {
    presets: [['babel-preset-expo']],
  };
};
