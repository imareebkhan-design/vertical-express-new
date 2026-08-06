// Test-only stub. `server-only` is a bare specifier that Next's bundler aliases
// at build time; plain Node cannot resolve it, which would break unit tests of
// any `import "server-only"` module. The `test` script puts this directory on
// NODE_PATH so Node resolves the specifier to this no-op module. Not used by the
// application build.
module.exports = {};
