/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from "vs/base/common/event"
import { IMarkdownString } from "vs/base/common/htmlContent"
import { IDisposable, IReference } from "vs/base/common/lifecycle"
import { URI } from "vs/base/common/uri"
import { ITextModel, ITextSnapshot } from "vs/editor/common/model"
import { IResolvableEditorModel } from "vs/platform/editor/common/editor"
import { createDecorator } from "vs/platform/instantiation/common/instantiation"

export const ITextModelService =
  createDecorator<ITextModelService>("textModelService")

export interface ITextModelService {
  readonly _serviceBrand: undefined

  /**
   * Provided a resource URI, it will return a model reference
   * which should be disposed once not needed anymore.
   */
  createModelReference(
    resource: URI,
  ): Promise<IReference<IResolvedTextEditorModel>>

  /**
   * Registers a specific `scheme` content provider.
   */
  registerTextModelContentProvider(
    scheme: string,
    provider: ITextModelContentProvider,
  ): IDisposable

  /**
   * Check if the given resource can be resolved to a text model.
   */
  canHandleResource(resource: URI): boolean
}

export interface ITextModelContentProvider {
  /**
   * Given a resource, return the content of the resource as `ITextModel`.
   */
  provideTextContent(resource: URI): Promise<ITextModel | null> | null
}

export interface ITextEditorModel extends IResolvableEditorModel {
  /**
   * Emitted when the text model is about to be disposed.
   */
  readonly onWillDispose: Event<void>

  /**
   * Provides access to the underlying `ITextModel`.
   */
  readonly textEditorModel: ITextModel | null

  /**
   * Creates a snapshot of the model's contents.
   */
  createSnapshot(this: IResolvedTextEditorModel): ITextSnapshot
  createSnapshot(this: ITextEditorModel): ITextSnapshot | null

  /**
   * Signals if this model is readonly or not.
   */
  isReadonly(): boolean | IMarkdownString

  /**
   * The language id of the text model if known.
   */
  getLanguageId(): string | undefined

  /**
   * Find out if this text model has been disposed.
   */
  isDisposed(): boolean
}

export interface IResolvedTextEditorModel extends ITextEditorModel {
  /**
   * Same as ITextEditorModel#textEditorModel, but never null.
   */
  readonly textEditorModel: ITextModel
}

export function isResolvedTextEditorModel(
  model: ITextEditorModel,
): model is IResolvedTextEditorModel {
  const candidate = model as IResolvedTextEditorModel

  return !!candidate.textEditorModel
}
