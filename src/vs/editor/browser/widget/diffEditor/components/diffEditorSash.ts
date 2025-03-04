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
  IBoundarySashes,
  ISashEvent,
  Orientation,
  Sash,
  SashState,
} from "vs/base/browser/ui/sash/sash"
import { Disposable } from "vs/base/common/lifecycle"
import {
  IObservable,
  IReader,
  ISettableObservable,
  autorun,
  observableValue,
} from "vs/base/common/observable"
import { DiffEditorOptions } from "../diffEditorOptions"
import { derivedWithSetter } from "vs/base/common/observableInternal/derived"

export class SashLayout {
  public readonly sashLeft = derivedWithSetter(
    this,
    (reader) => {
      const ratio =
        this._sashRatio.read(reader) ??
        this._options.splitViewDefaultRatio.read(reader)
      return this._computeSashLeft(ratio, reader)
    },
    (value, tx) => {
      const contentWidth = this.dimensions.width.get()
      this._sashRatio.set(value / contentWidth, tx)
    },
  )

  private readonly _sashRatio = observableValue<number | undefined>(
    this,
    undefined,
  )

  public resetSash(): void {
    this._sashRatio.set(undefined, undefined)
  }

  constructor(
    private readonly _options: DiffEditorOptions,
    public readonly dimensions: {
      height: IObservable<number>
      width: IObservable<number>
    },
  ) {}

  /** @pure */
  private _computeSashLeft(
    desiredRatio: number,
    reader: IReader | undefined,
  ): number {
    const contentWidth = this.dimensions.width.read(reader)
    const midPoint = Math.floor(
      this._options.splitViewDefaultRatio.read(reader) * contentWidth,
    )
    const sashLeft = this._options.enableSplitViewResizing.read(reader)
      ? Math.floor(desiredRatio * contentWidth)
      : midPoint

    const MINIMUM_EDITOR_WIDTH = 100
    if (contentWidth <= MINIMUM_EDITOR_WIDTH * 2) {
      return midPoint
    }
    if (sashLeft < MINIMUM_EDITOR_WIDTH) {
      return MINIMUM_EDITOR_WIDTH
    }
    if (sashLeft > contentWidth - MINIMUM_EDITOR_WIDTH) {
      return contentWidth - MINIMUM_EDITOR_WIDTH
    }
    return sashLeft
  }
}

export class DiffEditorSash extends Disposable {
  private readonly _sash = this._register(
    new Sash(
      this._domNode,
      {
        getVerticalSashTop: (_sash: Sash): number => 0,
        getVerticalSashLeft: (_sash: Sash): number => this.sashLeft.get(),
        getVerticalSashHeight: (_sash: Sash): number =>
          this._dimensions.height.get(),
      },
      { orientation: Orientation.VERTICAL },
    ),
  )

  private _startSashPosition: number | undefined = undefined

  constructor(
    private readonly _domNode: HTMLElement,
    private readonly _dimensions: {
      height: IObservable<number>
      width: IObservable<number>
    },
    private readonly _enabled: IObservable<boolean>,
    private readonly _boundarySashes: IObservable<
      IBoundarySashes | undefined,
      void
    >,
    public readonly sashLeft: ISettableObservable<number>,
    private readonly _resetSash: () => void,
  ) {
    super()

    this._register(
      this._sash.onDidStart(() => {
        this._startSashPosition = this.sashLeft.get()
      }),
    )
    this._register(
      this._sash.onDidChange((e: ISashEvent) => {
        this.sashLeft.set(
          this._startSashPosition! + (e.currentX - e.startX),
          undefined,
        )
      }),
    )
    this._register(this._sash.onDidEnd(() => this._sash.layout()))
    this._register(this._sash.onDidReset(() => this._resetSash()))

    this._register(
      autorun((reader) => {
        const sashes = this._boundarySashes.read(reader)
        if (sashes) {
          this._sash.orthogonalEndSash = sashes.bottom
        }
      }),
    )

    this._register(
      autorun((reader) => {
        /** @description DiffEditorSash.layoutSash */
        const enabled = this._enabled.read(reader)
        this._sash.state = enabled ? SashState.Enabled : SashState.Disabled
        this.sashLeft.read(reader)
        this._dimensions.height.read(reader)
        this._sash.layout()
      }),
    )
  }
}
