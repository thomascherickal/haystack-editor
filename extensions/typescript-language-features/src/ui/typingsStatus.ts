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
import { ITypeScriptServiceClient } from "../typescriptService"
import { Disposable } from "../utils/dispose"

const typingsInstallTimeout = 30 * 1000

export default class TypingsStatus extends Disposable {
  private readonly _acquiringTypings = new Map<number, NodeJS.Timeout>()
  private readonly _client: ITypeScriptServiceClient

  constructor(client: ITypeScriptServiceClient) {
    super()
    this._client = client

    this._register(
      this._client.onDidBeginInstallTypings((event) =>
        this.onBeginInstallTypings(event.eventId),
      ),
    )

    this._register(
      this._client.onDidEndInstallTypings((event) =>
        this.onEndInstallTypings(event.eventId),
      ),
    )
  }

  public override dispose(): void {
    super.dispose()

    for (const timeout of this._acquiringTypings.values()) {
      clearTimeout(timeout)
    }
  }

  public get isAcquiringTypings(): boolean {
    return Object.keys(this._acquiringTypings).length > 0
  }

  private onBeginInstallTypings(eventId: number): void {
    if (this._acquiringTypings.has(eventId)) {
      return
    }
    this._acquiringTypings.set(
      eventId,
      setTimeout(() => {
        this.onEndInstallTypings(eventId)
      }, typingsInstallTimeout),
    )
  }

  private onEndInstallTypings(eventId: number): void {
    const timer = this._acquiringTypings.get(eventId)
    if (timer) {
      clearTimeout(timer)
    }
    this._acquiringTypings.delete(eventId)
  }
}

export class AtaProgressReporter extends Disposable {
  private readonly _promises = new Map<number, Function>()

  constructor(client: ITypeScriptServiceClient) {
    super()
    this._register(
      client.onDidBeginInstallTypings((e) => this._onBegin(e.eventId)),
    )
    this._register(
      client.onDidEndInstallTypings((e) => this._onEndOrTimeout(e.eventId)),
    )
    this._register(
      client.onTypesInstallerInitializationFailed((_) =>
        this.onTypesInstallerInitializationFailed(),
      ),
    )
  }

  override dispose(): void {
    super.dispose()
    this._promises.forEach((value) => value())
  }

  private _onBegin(eventId: number): void {
    const handle = setTimeout(
      () => this._onEndOrTimeout(eventId),
      typingsInstallTimeout,
    )
    const promise = new Promise<void>((resolve) => {
      this._promises.set(eventId, () => {
        clearTimeout(handle)
        resolve()
      })
    })

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: vscode.l10n.t(
          "Fetching data for better TypeScript IntelliSense",
        ),
      },
      () => promise,
    )
  }

  private _onEndOrTimeout(eventId: number): void {
    const resolve = this._promises.get(eventId)
    if (resolve) {
      this._promises.delete(eventId)
      resolve()
    }
  }

  private async onTypesInstallerInitializationFailed() {
    const config = vscode.workspace.getConfiguration("typescript")

    if (config.get<boolean>("check.npmIsInstalled", true)) {
      const dontShowAgain: vscode.MessageItem = {
        title: vscode.l10n.t("Don't Show Again"),
      }
      const selected = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          "Could not install typings files for JavaScript language features. Please ensure that NPM is installed, or configure 'typescript.npm' in your user settings. Alternatively, check the [documentation]({0}) to learn more.",
          "https://go.microsoft.com/fwlink/?linkid=847635",
        ),
        dontShowAgain,
      )

      if (selected === dontShowAgain) {
        config.update("check.npmIsInstalled", false, true)
      }
    }
  }
}
