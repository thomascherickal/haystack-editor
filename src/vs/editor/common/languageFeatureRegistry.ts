/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "vs/base/common/event"
import { IDisposable, toDisposable } from "vs/base/common/lifecycle"
import { ITextModel, shouldSynchronizeModel } from "vs/editor/common/model"
import {
  LanguageFilter,
  LanguageSelector,
  score,
} from "vs/editor/common/languageSelector"
import { URI } from "vs/base/common/uri"

interface Entry<T> {
  selector: LanguageSelector
  provider: T
  _score: number
  _time: number
}

function isExclusive(selector: LanguageSelector): boolean {
  if (typeof selector === "string") {
    return false
  } else if (Array.isArray(selector)) {
    return selector.every(isExclusive)
  } else {
    return !!(selector as LanguageFilter).exclusive // TODO: microsoft/TypeScript#42768
  }
}

export interface NotebookInfo {
  readonly uri: URI
  readonly type: string
}

export interface NotebookInfoResolver {
  (uri: URI): NotebookInfo | undefined
}

class MatchCandidate {
  constructor(
    readonly uri: URI,
    readonly languageId: string,
    readonly notebookUri: URI | undefined,
    readonly notebookType: string | undefined,
  ) {}

  equals(other: MatchCandidate): boolean {
    return (
      this.notebookType === other.notebookType &&
      this.languageId === other.languageId &&
      this.uri.toString() === other.uri.toString() &&
      this.notebookUri?.toString() === other.notebookUri?.toString()
    )
  }
}

export class LanguageFeatureRegistry<T> {
  private _clock: number = 0
  private readonly _entries: Entry<T>[] = []

  private readonly _onDidChange = new Emitter<number>()
  readonly onDidChange = this._onDidChange.event

  constructor(private readonly _notebookInfoResolver?: NotebookInfoResolver) {}

  register(selector: LanguageSelector, provider: T): IDisposable {
    let entry: Entry<T> | undefined = {
      selector,
      provider,
      _score: -1,
      _time: this._clock++,
    }

    this._entries.push(entry)
    this._lastCandidate = undefined
    this._onDidChange.fire(this._entries.length)

    return toDisposable(() => {
      if (entry) {
        const idx = this._entries.indexOf(entry)
        if (idx >= 0) {
          this._entries.splice(idx, 1)
          this._lastCandidate = undefined
          this._onDidChange.fire(this._entries.length)
          entry = undefined
        }
      }
    })
  }

  hasWithoutModel(uri: URI, languageId: string): boolean {
    return this.allWithoutModel(uri, languageId).length > 0
  }

  allWithoutModel(uri: URI, languageId: string): T[] {
    this._updateScoresWithoutModel(uri, languageId)
    const result: T[] = []

    // from registry
    for (const entry of this._entries) {
      if (entry._score > 0) {
        result.push(entry.provider)
      }
    }

    return result
  }

  has(model: ITextModel): boolean {
    return this.all(model).length > 0
  }

  all(model: ITextModel): T[] {
    if (!model) {
      return []
    }

    this._updateScores(model)
    const result: T[] = []

    // from registry
    for (const entry of this._entries) {
      if (entry._score > 0) {
        result.push(entry.provider)
      }
    }

    return result
  }

  ordered(model: ITextModel): T[] {
    const result: T[] = []
    this._orderedForEach(model, (entry) => result.push(entry.provider))
    return result
  }

  orderedWithoutModel(uri: URI, languageId: string): T[] {
    const result: T[] = []
    this._orderedForEachWithoutModel(uri, languageId, (entry) =>
      result.push(entry.provider),
    )
    return result
  }

  orderedGroups(model: ITextModel): T[][] {
    const result: T[][] = []
    let lastBucket: T[]
    let lastBucketScore: number

    this._orderedForEach(model, (entry) => {
      if (lastBucket && lastBucketScore === entry._score) {
        lastBucket.push(entry.provider)
      } else {
        lastBucketScore = entry._score
        lastBucket = [entry.provider]
        result.push(lastBucket)
      }
    })

    return result
  }

  private _orderedForEach(
    model: ITextModel,
    callback: (provider: Entry<T>) => any,
  ): void {
    this._updateScores(model)

    for (const entry of this._entries) {
      if (entry._score > 0) {
        callback(entry)
      }
    }
  }

  private _orderedForEachWithoutModel(
    uri: URI,
    languageId: string,
    callback: (provider: Entry<T>) => any,
  ): void {
    this._updateScoresWithoutModel(uri, languageId)

    for (const entry of this._entries) {
      if (entry._score > 0) {
        callback(entry)
      }
    }
  }

  private _lastCandidate: MatchCandidate | undefined

  private _updateScoresWithoutModel(uri: URI, languageId: string): void {
    const notebookInfo = this._notebookInfoResolver?.(uri)

    // use the uri (scheme, pattern) of the notebook info iff we have one
    // otherwise it's the model's/document's uri
    const candidate = notebookInfo
      ? new MatchCandidate(uri, languageId, notebookInfo.uri, notebookInfo.type)
      : new MatchCandidate(uri, languageId, undefined, undefined)

    if (this._lastCandidate?.equals(candidate)) {
      // nothing has changed
      return
    }

    this._lastCandidate = candidate

    for (const entry of this._entries) {
      entry._score = score(
        entry.selector,
        candidate.uri,
        candidate.languageId,
        /* candidateIsSynchronized */ true,
        candidate.notebookUri,
        candidate.notebookType,
      )

      if (isExclusive(entry.selector) && entry._score > 0) {
        // support for one exclusive selector that overwrites
        // any other selector
        for (const entry of this._entries) {
          entry._score = 0
        }
        entry._score = 1000
        break
      }
    }

    // needs sorting
    this._entries.sort(LanguageFeatureRegistry._compareByScoreAndTime)
  }

  private _updateScores(model: ITextModel): void {
    const notebookInfo = this._notebookInfoResolver?.(model.uri)

    // use the uri (scheme, pattern) of the notebook info iff we have one
    // otherwise it's the model's/document's uri
    const candidate = notebookInfo
      ? new MatchCandidate(
          model.uri,
          model.getLanguageId(),
          notebookInfo.uri,
          notebookInfo.type,
        )
      : new MatchCandidate(
          model.uri,
          model.getLanguageId(),
          undefined,
          undefined,
        )

    if (this._lastCandidate?.equals(candidate)) {
      // nothing has changed
      return
    }

    this._lastCandidate = candidate

    for (const entry of this._entries) {
      entry._score = score(
        entry.selector,
        candidate.uri,
        candidate.languageId,
        shouldSynchronizeModel(model),
        candidate.notebookUri,
        candidate.notebookType,
      )

      if (isExclusive(entry.selector) && entry._score > 0) {
        // support for one exclusive selector that overwrites
        // any other selector
        for (const entry of this._entries) {
          entry._score = 0
        }
        entry._score = 1000
        break
      }
    }

    // needs sorting
    this._entries.sort(LanguageFeatureRegistry._compareByScoreAndTime)
  }

  private static _compareByScoreAndTime(a: Entry<any>, b: Entry<any>): number {
    if (a._score < b._score) {
      return 1
    } else if (a._score > b._score) {
      return -1
    }

    // De-prioritize built-in providers
    if (isBuiltinSelector(a.selector) && !isBuiltinSelector(b.selector)) {
      return 1
    } else if (
      !isBuiltinSelector(a.selector) &&
      isBuiltinSelector(b.selector)
    ) {
      return -1
    }

    if (a._time < b._time) {
      return 1
    } else if (a._time > b._time) {
      return -1
    } else {
      return 0
    }
  }
}

function isBuiltinSelector(selector: LanguageSelector): boolean {
  if (typeof selector === "string") {
    return false
  }

  if (Array.isArray(selector)) {
    return selector.some(isBuiltinSelector)
  }

  return Boolean((selector as LanguageFilter).isBuiltin)
}
