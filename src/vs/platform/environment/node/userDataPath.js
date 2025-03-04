/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../../typings/require.d.ts" />

//@ts-check
;(function () {
  "use strict"

  /**
   * @typedef {import('../../environment/common/argv').NativeParsedArgs} NativeParsedArgs
   *
   * @param {typeof import('path')} path
   * @param {typeof import('os')} os
   * @param {string} cwd
   */
  function factory(path, os, cwd) {
    /**
     * @param {NativeParsedArgs} cliArgs
     * @param {string} productName
     *
     * @returns {string}
     */
    function getUserDataPath(cliArgs, productName) {
      const userDataPath = doGetUserDataPath(cliArgs, productName)
      const pathsToResolve = [userDataPath]

      // If the user-data-path is not absolute, make
      // sure to resolve it against the passed in
      // current working directory. We cannot use the
      // node.js `path.resolve()` logic because it will
      // not pick up our `HAYSTACK_CWD` environment variable
      // (https://github.com/microsoft/vscode/issues/120269)
      if (!path.isAbsolute(userDataPath)) {
        pathsToResolve.unshift(cwd)
      }

      return path.resolve(...pathsToResolve)
    }

    /**
     * @param {NativeParsedArgs} cliArgs
     * @param {string} productName
     *
     * @returns {string}
     */
    function doGetUserDataPath(cliArgs, productName) {
      // 0. Running out of sources has a fixed productName
      if (process.env["HAYSTACK_DEV"]) {
        productName = "code-oss-dev"
      }

      // 1. Support portable mode
      const portablePath = process.env["HAYSTACK_PORTABLE"]
      if (portablePath) {
        return path.join(portablePath, "user-data")
      }

      // 2. Support global HAYSTACK_APPDATA environment variable
      let appDataPath = process.env["HAYSTACK_APPDATA"]
      if (appDataPath) {
        return path.join(appDataPath, productName)
      }

      // With Electron>=13 --user-data-dir switch will be propagated to
      // all processes https://github.com/electron/electron/blob/1897b14af36a02e9aa7e4d814159303441548251/shell/browser/electron_browser_client.cc#L546-L553
      // Check HAYSTACK_PORTABLE and HAYSTACK_APPDATA before this case to get correct values.
      // 3. Support explicit --user-data-dir
      const cliPath = cliArgs["user-data-dir"]
      if (cliPath) {
        return cliPath
      }

      // 4. Otherwise check per platform
      switch (process.platform) {
        case "win32":
          appDataPath = process.env["APPDATA"]
          if (!appDataPath) {
            const userProfile = process.env["USERPROFILE"]
            if (typeof userProfile !== "string") {
              throw new Error(
                "Windows: Unexpected undefined %USERPROFILE% environment variable",
              )
            }

            appDataPath = path.join(userProfile, "AppData", "Roaming")
          }
          break
        case "darwin":
          appDataPath = path.join(
            os.homedir(),
            "Library",
            "Application Support",
          )
          break
        case "linux":
          appDataPath =
            process.env["XDG_CONFIG_HOME"] || path.join(os.homedir(), ".config")
          break
        default:
          throw new Error("Platform not supported")
      }

      return path.join(appDataPath, productName)
    }

    return {
      getUserDataPath,
    }
  }

  if (typeof define === "function") {
    define(["path", "os", "vs/base/common/process"], function (
      /** @type {typeof import('path')} */ path,
      /** @type {typeof import('os')} */ os,
      /** @type {typeof import("../../../base/common/process")} */ process,
    ) {
      return factory(path, os, process.cwd()) // amd
    })
  } else if (typeof module === "object" && typeof module.exports === "object") {
    const path = require("path")
    const os = require("os")

    module.exports = factory(
      path,
      os,
      process.env["HAYSTACK_CWD"] || process.cwd(),
    ) // commonjs
  } else {
    throw new Error("Unknown context")
  }
})()
