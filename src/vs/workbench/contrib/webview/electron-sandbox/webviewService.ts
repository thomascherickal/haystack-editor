/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  IWebviewElement,
  WebviewInitInfo,
} from "vs/workbench/contrib/webview/browser/webview"
import { WebviewService } from "vs/workbench/contrib/webview/browser/webviewService"
import { ElectronWebviewElement } from "vs/workbench/contrib/webview/electron-sandbox/webviewElement"

export class ElectronWebviewService extends WebviewService {
  override createWebviewElement(initInfo: WebviewInitInfo): IWebviewElement {
    const webview = this._instantiationService.createInstance(
      ElectronWebviewElement,
      initInfo,
      this._webviewThemeDataProvider,
    )
    this.registerNewWebview(webview)
    return webview
  }
}
