/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from "vs/base/common/lifecycle"
import { ICodeEditor } from "vs/editor/browser/editorBrowser"
import {
  IContextKey,
  IContextKeyService,
  RawContextKey,
} from "vs/platform/contextkey/common/contextkey"
import { CompletionModel } from "./completionModel"
import { ISelectedSuggestion } from "./suggestWidget"

export class SuggestAlternatives {
  static readonly OtherSuggestions = new RawContextKey<boolean>(
    "hasOtherSuggestions",
    false,
  )

  private readonly _ckOtherSuggestions: IContextKey<boolean>

  private _index: number = 0
  private _model: CompletionModel | undefined
  private _acceptNext: ((selected: ISelectedSuggestion) => any) | undefined
  private _listener: IDisposable | undefined
  private _ignore: boolean | undefined

  constructor(
    private readonly _editor: ICodeEditor,
    @IContextKeyService contextKeyService: IContextKeyService,
  ) {
    this._ckOtherSuggestions =
      SuggestAlternatives.OtherSuggestions.bindTo(contextKeyService)
  }

  dispose(): void {
    this.reset()
  }

  reset(): void {
    this._ckOtherSuggestions.reset()
    this._listener?.dispose()
    this._model = undefined
    this._acceptNext = undefined
    this._ignore = false
  }

  set(
    { model, index }: ISelectedSuggestion,
    acceptNext: (selected: ISelectedSuggestion) => any,
  ): void {
    // no suggestions -> nothing to do
    if (model.items.length === 0) {
      this.reset()
      return
    }

    // no alternative suggestions -> nothing to do
    const nextIndex = SuggestAlternatives._moveIndex(true, model, index)
    if (nextIndex === index) {
      this.reset()
      return
    }

    this._acceptNext = acceptNext
    this._model = model
    this._index = index
    this._listener = this._editor.onDidChangeCursorPosition(() => {
      if (!this._ignore) {
        this.reset()
      }
    })
    this._ckOtherSuggestions.set(true)
  }

  private static _moveIndex(
    fwd: boolean,
    model: CompletionModel,
    index: number,
  ): number {
    let newIndex = index
    for (let rounds = model.items.length; rounds > 0; rounds--) {
      newIndex =
        (newIndex + model.items.length + (fwd ? +1 : -1)) % model.items.length
      if (newIndex === index) {
        break
      }
      if (!model.items[newIndex].completion.additionalTextEdits) {
        break
      }
    }
    return newIndex
  }

  next(): void {
    this._move(true)
  }

  prev(): void {
    this._move(false)
  }

  private _move(fwd: boolean): void {
    if (!this._model) {
      // nothing to reason about
      return
    }
    try {
      this._ignore = true
      this._index = SuggestAlternatives._moveIndex(
        fwd,
        this._model,
        this._index,
      )
      this._acceptNext!({
        index: this._index,
        item: this._model.items[this._index],
        model: this._model,
      })
    } finally {
      this._ignore = false
    }
  }
}
