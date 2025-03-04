/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorPaneService } from "vs/workbench/services/editor/common/editorPaneService"
import { EditorPaneDescriptor } from "vs/workbench/browser/editor"
import {
  InstantiationType,
  registerSingleton,
} from "vs/platform/instantiation/common/extensions"

export class EditorPaneService implements IEditorPaneService {
  declare readonly _serviceBrand: undefined

  readonly onWillInstantiateEditorPane =
    EditorPaneDescriptor.onWillInstantiateEditorPane

  didInstantiateEditorPane(typeId: string): boolean {
    return EditorPaneDescriptor.didInstantiateEditorPane(typeId)
  }
}

registerSingleton(
  IEditorPaneService,
  EditorPaneService,
  InstantiationType.Delayed,
)
