/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode"

export interface DocumentSelector {
  /**
   * Selector for files which only require a basic syntax server.
   */
  readonly syntax: readonly vscode.DocumentFilter[]

  /**
   * Selector for files which require semantic server support.
   */
  readonly semantic: readonly vscode.DocumentFilter[]
}
