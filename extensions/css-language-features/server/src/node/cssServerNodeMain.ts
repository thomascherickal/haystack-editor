/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from "@vscode/l10n"
async function setupMain() {
  const l10nLog: string[] = []

  const i10lLocation = process.env["HAYSTACK_L10N_BUNDLE_LOCATION"]
  if (i10lLocation) {
    try {
      await l10n.config({ uri: i10lLocation })
      l10nLog.push(`l10n: Configured to ${i10lLocation.toString()}`)
    } catch (e) {
      l10nLog.push(`l10n: Problems loading ${i10lLocation.toString()} : ${e}`)
    }
  }
  await import("./cssServerMain")
  l10nLog.forEach(console.log)
}
setupMain()
