/* No code is executed until this test wrapper is explicitly invoked. */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (specifier, parent, ...rest) {
  return resolve.call(this, specifier.startsWith("@/") ? path.resolve(__dirname, "../..", specifier.slice(2)) : specifier, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
require("./validation.test.ts");
