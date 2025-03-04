/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const Schemes = Object.freeze({
  http: "http",
  https: "https",
  file: "file",
  untitled: "untitled",
  mailto: "mailto",
  vscode: "vscode",
  "vscode-insiders": "vscode-insiders",
  notebookCell: "vscode-notebook-cell",
})

export function isOfScheme(scheme: string, link: string): boolean {
  return link.toLowerCase().startsWith(scheme + ":")
}
