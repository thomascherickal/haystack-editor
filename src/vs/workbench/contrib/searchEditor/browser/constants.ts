/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from "vs/platform/contextkey/common/contextkey"

export const InSearchEditor = new RawContextKey<boolean>(
  "inSearchEditor",
  false,
)

export const SearchEditorScheme = "search-editor"

export const SearchEditorWorkingCopyTypeId = "search/editor"

export const SearchEditorFindMatchClass = "searchEditorFindMatch"

export const SearchEditorID = "workbench.editor.searchEditor"

export const OpenNewEditorCommandId = "search.action.openNewEditor"
export const OpenEditorCommandId = "search.action.openEditor"
export const ToggleSearchEditorContextLinesCommandId =
  "toggleSearchEditorContextLines"

export const SearchEditorInputTypeId =
  "workbench.editorinputs.searchEditorInput"
