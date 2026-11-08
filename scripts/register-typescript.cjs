"use strict";

/**
 * Test-only, in-memory TypeScript loading using the dependency already installed
 * in this repository. This is a transpiler, not a substitute for tsc or next build.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const projectRoot = path.resolve(__dirname, "..");
let registrations = 0;
let uninstall = null;

function registerTypescript() {
  if (registrations === 0) {
    const ts = require("typescript");
    const previousResolve = Module._resolveFilename;
    const previousTs = require.extensions[".ts"];
    const previousTsx = require.extensions[".tsx"];

    const resolve = function(request, parent, isMain, options) {
      const mapped = typeof request === "string" && request.startsWith("@/")
        ? path.join(projectRoot, "src", request.slice(2))
        : request;
      return previousResolve.call(this, mapped, parent, isMain, options);
    };
    const compile = (loadedModule, filename) => {
      const source = fs.readFileSync(filename, "utf8");
      const result = ts.transpileModule(source, {
        fileName: filename,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      });
      const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
      if (errors.length) {
        throw new SyntaxError(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
      }
      loadedModule._compile(result.outputText, filename);
    };
    Module._resolveFilename = resolve;
    require.extensions[".ts"] = compile;
    require.extensions[".tsx"] = compile;
    uninstall = () => {
      if (Module._resolveFilename === resolve) Module._resolveFilename = previousResolve;
      if (require.extensions[".ts"] === compile) {
        if (previousTs) require.extensions[".ts"] = previousTs;
        else delete require.extensions[".ts"];
      }
      if (require.extensions[".tsx"] === compile) {
        if (previousTsx) require.extensions[".tsx"] = previousTsx;
        else delete require.extensions[".tsx"];
      }
    };
  }
  registrations += 1;
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    registrations -= 1;
    if (registrations === 0) {
      uninstall();
      uninstall = null;
    }
  };
}

module.exports = { registerTypescript, projectRoot };
