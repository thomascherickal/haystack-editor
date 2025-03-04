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
  DisposableStore,
  IDisposable,
  toDisposable,
} from "vs/base/common/lifecycle"
import { Schemas } from "vs/base/common/network"
import { URI } from "vs/base/common/uri"
import * as pfs from "vs/base/node/pfs"
import { ILogService } from "vs/platform/log/common/log"
import { IExtHostInitDataService } from "vs/workbench/api/common/extHostInitDataService"
import { IExtHostRpcService } from "vs/workbench/api/common/extHostRpcService"
import {
  ExtHostSearch,
  reviveQuery,
} from "vs/workbench/api/common/extHostSearch"
import { IURITransformerService } from "vs/workbench/api/common/extHostUriTransformerService"
import {
  IFileQuery,
  IRawFileQuery,
  ISearchCompleteStats,
  ISerializedSearchProgressItem,
  isSerializedFileMatch,
  ITextQuery,
} from "vs/workbench/services/search/common/search"
import { TextSearchManager } from "vs/workbench/services/search/common/textSearchManager"
import { SearchService } from "vs/workbench/services/search/node/rawSearchService"
import { RipgrepSearchProvider } from "vs/workbench/services/search/node/ripgrepSearchProvider"
import { OutputChannel } from "vs/workbench/services/search/node/ripgrepSearchUtils"
import { NativeTextSearchManager } from "vs/workbench/services/search/node/textSearchManager"
import type * as vscode from "vscode"

export class NativeExtHostSearch extends ExtHostSearch implements IDisposable {
  protected _pfs: typeof pfs = pfs // allow extending for tests

  private _internalFileSearchHandle: number = -1
  private _internalFileSearchProvider: SearchService | null = null

  private _registeredEHSearchProvider = false

  private readonly _disposables = new DisposableStore()

  constructor(
    @IExtHostRpcService extHostRpc: IExtHostRpcService,
    @IExtHostInitDataService initData: IExtHostInitDataService,
    @IURITransformerService _uriTransformer: IURITransformerService,
    @ILogService _logService: ILogService,
  ) {
    super(extHostRpc, _uriTransformer, _logService)

    const outputChannel = new OutputChannel("RipgrepSearchUD", this._logService)
    this._disposables.add(
      this.registerTextSearchProvider(
        Schemas.vscodeUserData,
        new RipgrepSearchProvider(outputChannel),
      ),
    )
    if (initData.remote.isRemote && initData.remote.authority) {
      this._registerEHSearchProviders()
    }
  }

  dispose(): void {
    this._disposables.dispose()
  }

  override $enableExtensionHostSearch(): void {
    this._registerEHSearchProviders()
  }

  private _registerEHSearchProviders(): void {
    if (this._registeredEHSearchProvider) {
      return
    }

    this._registeredEHSearchProvider = true
    const outputChannel = new OutputChannel("RipgrepSearchEH", this._logService)
    this._disposables.add(
      this.registerTextSearchProvider(
        Schemas.file,
        new RipgrepSearchProvider(outputChannel),
      ),
    )
    this._disposables.add(
      this.registerInternalFileSearchProvider(
        Schemas.file,
        new SearchService("fileSearchProvider"),
      ),
    )
  }

  private registerInternalFileSearchProvider(
    scheme: string,
    provider: SearchService,
  ): IDisposable {
    const handle = this._handlePool++
    this._internalFileSearchProvider = provider
    this._internalFileSearchHandle = handle
    this._proxy.$registerFileSearchProvider(
      handle,
      this._transformScheme(scheme),
    )
    return toDisposable(() => {
      this._internalFileSearchProvider = null
      this._proxy.$unregisterProvider(handle)
    })
  }

  override $provideFileSearchResults(
    handle: number,
    session: number,
    rawQuery: IRawFileQuery,
    token: vscode.CancellationToken,
  ): Promise<ISearchCompleteStats> {
    const query = reviveQuery(rawQuery)
    if (handle === this._internalFileSearchHandle) {
      const start = Date.now()
      return this.doInternalFileSearch(handle, session, query, token).then(
        (result) => {
          const elapsed = Date.now() - start
          this._logService.debug(`Ext host file search time: ${elapsed}ms`)
          return result
        },
      )
    }

    return super.$provideFileSearchResults(handle, session, rawQuery, token)
  }

  override doInternalFileSearchWithCustomCallback(
    rawQuery: IFileQuery,
    token: vscode.CancellationToken,
    handleFileMatch: (data: URI[]) => void,
  ): Promise<ISearchCompleteStats> {
    const onResult = (ev: ISerializedSearchProgressItem) => {
      if (isSerializedFileMatch(ev)) {
        ev = [ev]
      }

      if (Array.isArray(ev)) {
        handleFileMatch(ev.map((m) => URI.file(m.path)))
        return
      }

      if (ev.message) {
        this._logService.debug("ExtHostSearch", ev.message)
      }
    }

    if (!this._internalFileSearchProvider) {
      throw new Error("No internal file search handler")
    }

    return <Promise<ISearchCompleteStats>>(
      this._internalFileSearchProvider.doFileSearch(rawQuery, onResult, token)
    )
  }

  private async doInternalFileSearch(
    handle: number,
    session: number,
    rawQuery: IFileQuery,
    token: vscode.CancellationToken,
  ): Promise<ISearchCompleteStats> {
    return this.doInternalFileSearchWithCustomCallback(
      rawQuery,
      token,
      (data) => {
        this._proxy.$handleFileMatch(handle, session, data)
      },
    )
  }

  override $clearCache(cacheKey: string): Promise<void> {
    this._internalFileSearchProvider?.clearCache(cacheKey)

    return super.$clearCache(cacheKey)
  }

  protected override createTextSearchManager(
    query: ITextQuery,
    provider: vscode.TextSearchProvider,
  ): TextSearchManager {
    return new NativeTextSearchManager(
      query,
      provider,
      undefined,
      "textSearchProvider",
    )
  }
}
