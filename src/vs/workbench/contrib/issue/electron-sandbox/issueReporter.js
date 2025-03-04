/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
;(function () {
  "use strict"

  const bootstrapWindow = bootstrapWindowLib()

  // Load issue reporter into window
  bootstrapWindow.load(
    ["vs/workbench/contrib/issue/electron-sandbox/issueReporterMain"],
    function (issueReporter, configuration) {
      return issueReporter.startup(configuration)
    },
    {
      configureDeveloperSettings: function () {
        return {
          forceEnableDeveloperKeybindings: true,
          disallowReloadKeybinding: true,
        }
      },
    },
  )

  /**
   * @typedef {import('../../../../base/parts/sandbox/common/sandboxTypes').ISandboxConfiguration} ISandboxConfiguration
   *
   * @returns {{
   *   load: (
   *     modules: string[],
   *     resultCallback: (result, configuration: ISandboxConfiguration) => unknown,
   *     options?: {
   *       configureDeveloperSettings?: (config: ISandboxConfiguration) => {
   * 			forceEnableDeveloperKeybindings?: boolean,
   * 			disallowReloadKeybinding?: boolean,
   * 			removeDeveloperKeybindingsAfterLoad?: boolean
   * 		 }
   *     }
   *   ) => Promise<unknown>
   * }}
   */
  function bootstrapWindowLib() {
    // @ts-ignore (defined in bootstrap-window.js)
    return window.MonacoBootstrapWindow
  }
})()
