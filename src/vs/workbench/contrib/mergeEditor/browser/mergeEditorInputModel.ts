/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn } from "vs/base/common/assert"
import { BugIndicatingError } from "vs/base/common/errors"
import { Event } from "vs/base/common/event"
import { DisposableStore, IDisposable } from "vs/base/common/lifecycle"
import {
  derived,
  IObservable,
  observableFromEvent,
  observableValue,
} from "vs/base/common/observable"
import { basename, isEqual } from "vs/base/common/resources"
import Severity from "vs/base/common/severity"
import { URI } from "vs/base/common/uri"
import { IModelService } from "vs/editor/common/services/model"
import {
  IResolvedTextEditorModel,
  ITextModelService,
} from "vs/editor/common/services/resolverService"
import { localize } from "vs/nls"
import {
  ConfirmResult,
  IDialogService,
  IPromptButton,
} from "vs/platform/dialogs/common/dialogs"
import { IInstantiationService } from "vs/platform/instantiation/common/instantiation"
import {
  IStorageService,
  StorageScope,
  StorageTarget,
} from "vs/platform/storage/common/storage"
import { IRevertOptions, SaveSourceRegistry } from "vs/workbench/common/editor"
import { EditorModel } from "vs/workbench/common/editor/editorModel"
import { MergeEditorInputData } from "vs/workbench/contrib/mergeEditor/browser/mergeEditorInput"
import { conflictMarkers } from "vs/workbench/contrib/mergeEditor/browser/mergeMarkers/mergeMarkersController"
import { MergeDiffComputer } from "vs/workbench/contrib/mergeEditor/browser/model/diffComputer"
import {
  InputData,
  MergeEditorModel,
} from "vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel"
import { MergeEditorTelemetry } from "vs/workbench/contrib/mergeEditor/browser/telemetry"
import { StorageCloseWithConflicts } from "vs/workbench/contrib/mergeEditor/common/mergeEditor"
import { IEditorService } from "vs/workbench/services/editor/common/editorService"
import {
  ITextFileEditorModel,
  ITextFileSaveOptions,
  ITextFileService,
} from "vs/workbench/services/textfile/common/textfiles"

export interface MergeEditorArgs {
  base: URI
  input1: MergeEditorInputData
  input2: MergeEditorInputData
  result: URI
}

export interface IMergeEditorInputModelFactory {
  createInputModel(args: MergeEditorArgs): Promise<IMergeEditorInputModel>
}

export interface IMergeEditorInputModel extends IDisposable {
  readonly resultUri: URI

  readonly model: MergeEditorModel
  readonly isDirty: IObservable<boolean>

  save(options?: ITextFileSaveOptions): Promise<void>

  /**
   * If save resets the dirty state, revert must do so too.
   */
  revert(options?: IRevertOptions): Promise<void>

  shouldConfirmClose(): boolean

  confirmClose(inputModels: IMergeEditorInputModel[]): Promise<ConfirmResult>

  /**
   * Marks the merge as done. The merge editor must be closed afterwards.
   */
  accept(): Promise<void>
}

/* ================ Temp File ================ */

export class TempFileMergeEditorModeFactory
  implements IMergeEditorInputModelFactory
{
  constructor(
    private readonly _mergeEditorTelemetry: MergeEditorTelemetry,
    @IInstantiationService
    private readonly _instantiationService: IInstantiationService,
    @ITextModelService private readonly _textModelService: ITextModelService,
    @IModelService private readonly _modelService: IModelService,
  ) {}

  async createInputModel(
    args: MergeEditorArgs,
  ): Promise<IMergeEditorInputModel> {
    const store = new DisposableStore()

    const [base, result, input1Data, input2Data] = await Promise.all([
      this._textModelService.createModelReference(args.base),
      this._textModelService.createModelReference(args.result),
      toInputData(args.input1, this._textModelService, store),
      toInputData(args.input2, this._textModelService, store),
    ])

    store.add(base)
    store.add(result)

    const tempResultUri = result.object.textEditorModel.uri.with({
      scheme: "merge-result",
    })

    const temporaryResultModel = this._modelService.createModel(
      "",
      {
        languageId: result.object.textEditorModel.getLanguageId(),
        onDidChange: Event.None,
      },
      tempResultUri,
    )
    store.add(temporaryResultModel)

    const mergeDiffComputer =
      this._instantiationService.createInstance(MergeDiffComputer)
    const model = this._instantiationService.createInstance(
      MergeEditorModel,
      base.object.textEditorModel,
      input1Data,
      input2Data,
      temporaryResultModel,
      mergeDiffComputer,
      {
        resetResult: true,
      },
      this._mergeEditorTelemetry,
    )
    store.add(model)

    await model.onInitialized

    return this._instantiationService.createInstance(
      TempFileMergeEditorInputModel,
      model,
      store,
      result.object,
      args.result,
    )
  }
}

class TempFileMergeEditorInputModel
  extends EditorModel
  implements IMergeEditorInputModel
{
  private readonly savedAltVersionId = observableValue(
    this,
    this.model.resultTextModel.getAlternativeVersionId(),
  )
  private readonly altVersionId = observableFromEvent(
    (e) => this.model.resultTextModel.onDidChangeContent(e),
    () =>
      /** @description getAlternativeVersionId */ this.model.resultTextModel.getAlternativeVersionId(),
  )

  public readonly isDirty = derived(
    this,
    (reader) =>
      this.altVersionId.read(reader) !== this.savedAltVersionId.read(reader),
  )

  private finished = false

  constructor(
    public readonly model: MergeEditorModel,
    private readonly disposable: IDisposable,
    private readonly result: IResolvedTextEditorModel,
    public readonly resultUri: URI,
    @ITextFileService private readonly textFileService: ITextFileService,
    @IDialogService private readonly dialogService: IDialogService,
    @IEditorService private readonly editorService: IEditorService,
  ) {
    super()
  }

  override dispose(): void {
    this.disposable.dispose()
    super.dispose()
  }

  async accept(): Promise<void> {
    const value = await this.model.resultTextModel.getValue()
    this.result.textEditorModel.setValue(value)
    this.savedAltVersionId.set(
      this.model.resultTextModel.getAlternativeVersionId(),
      undefined,
    )
    await this.textFileService.save(this.result.textEditorModel.uri)
    this.finished = true
  }

  private async _discard(): Promise<void> {
    await this.textFileService.revert(this.model.resultTextModel.uri)
    this.savedAltVersionId.set(
      this.model.resultTextModel.getAlternativeVersionId(),
      undefined,
    )
    this.finished = true
  }

  public shouldConfirmClose(): boolean {
    return true
  }

  public async confirmClose(
    inputModels: TempFileMergeEditorInputModel[],
  ): Promise<ConfirmResult> {
    assertFn(() => inputModels.some((m) => m === this))

    const someDirty = inputModels.some((m) => m.isDirty.get())
    let choice: ConfirmResult
    if (someDirty) {
      const isMany = inputModels.length > 1

      const message = isMany
        ? localize(
            "messageN",
            "Do you want keep the merge result of {0} files?",
            inputModels.length,
          )
        : localize(
            "message1",
            "Do you want keep the merge result of {0}?",
            basename(inputModels[0].model.resultTextModel.uri),
          )

      const hasUnhandledConflicts = inputModels.some((m) =>
        m.model.hasUnhandledConflicts.get(),
      )

      const buttons: IPromptButton<ConfirmResult>[] = [
        {
          label: hasUnhandledConflicts
            ? localize(
                { key: "saveWithConflict", comment: ["&& denotes a mnemonic"] },
                "&&Save With Conflicts",
              )
            : localize(
                { key: "save", comment: ["&& denotes a mnemonic"] },
                "&&Save",
              ),
          run: () => ConfirmResult.SAVE,
        },
        {
          label: localize(
            { key: "discard", comment: ["&& denotes a mnemonic"] },
            "Do&&n't Save",
          ),
          run: () => ConfirmResult.DONT_SAVE,
        },
      ]

      choice = (
        await this.dialogService.prompt<ConfirmResult>({
          type: Severity.Info,
          message,
          detail: hasUnhandledConflicts
            ? isMany
              ? localize(
                  "detailNConflicts",
                  "The files contain unhandled conflicts. The merge results will be lost if you don't save them.",
                )
              : localize(
                  "detail1Conflicts",
                  "The file contains unhandled conflicts. The merge result will be lost if you don't save it.",
                )
            : isMany
              ? localize(
                  "detailN",
                  "The merge results will be lost if you don't save them.",
                )
              : localize(
                  "detail1",
                  "The merge result will be lost if you don't save it.",
                ),
          buttons,
          cancelButton: {
            run: () => ConfirmResult.CANCEL,
          },
        })
      ).result
    } else {
      choice = ConfirmResult.DONT_SAVE
    }

    if (choice === ConfirmResult.SAVE) {
      // save with conflicts
      await Promise.all(inputModels.map((m) => m.accept()))
    } else if (choice === ConfirmResult.DONT_SAVE) {
      // discard changes
      await Promise.all(inputModels.map((m) => m._discard()))
    } else {
      // cancel: stay in editor
    }
    return choice
  }

  public async save(options?: ITextFileSaveOptions): Promise<void> {
    if (this.finished) {
      return
    }
    // It does not make sense to save anything in the temp file mode.
    // The file stays dirty from the first edit on.

    ;(async () => {
      const { confirmed } = await this.dialogService.confirm({
        message: localize(
          "saveTempFile.message",
          "Do you want to accept the merge result?",
        ),
        detail: localize(
          "saveTempFile.detail",
          "This will write the merge result to the original file and close the merge editor.",
        ),
        primaryButton: localize(
          { key: "acceptMerge", comment: ["&& denotes a mnemonic"] },
          "&&Accept Merge",
        ),
      })

      if (confirmed) {
        await this.accept()
        const editors = this.editorService
          .findEditors(this.resultUri)
          .filter((e) => e.editor.typeId === "mergeEditor.Input")
        await this.editorService.closeEditors(editors)
      }
    })()
  }

  public async revert(options?: IRevertOptions): Promise<void> {
    // no op
  }
}

/* ================ Workspace ================ */

export class WorkspaceMergeEditorModeFactory
  implements IMergeEditorInputModelFactory
{
  constructor(
    private readonly _mergeEditorTelemetry: MergeEditorTelemetry,
    @IInstantiationService
    private readonly _instantiationService: IInstantiationService,
    @ITextModelService private readonly _textModelService: ITextModelService,
    @ITextFileService private readonly textFileService: ITextFileService,
  ) {}

  private static readonly FILE_SAVED_SOURCE = SaveSourceRegistry.registerSource(
    "merge-editor.source",
    localize(
      "merge-editor.source",
      "Before Resolving Conflicts In Merge Editor",
    ),
  )

  public async createInputModel(
    args: MergeEditorArgs,
  ): Promise<IMergeEditorInputModel> {
    const store = new DisposableStore()

    let resultTextFileModel = undefined as ITextFileEditorModel | undefined
    const modelListener = store.add(new DisposableStore())
    const handleDidCreate = (model: ITextFileEditorModel) => {
      if (isEqual(args.result, model.resource)) {
        modelListener.clear()
        resultTextFileModel = model
      }
    }
    modelListener.add(this.textFileService.files.onDidCreate(handleDidCreate))
    this.textFileService.files.models.forEach(handleDidCreate)

    const [base, result, input1Data, input2Data] = await Promise.all([
      this._textModelService.createModelReference(args.base),
      this._textModelService.createModelReference(args.result),
      toInputData(args.input1, this._textModelService, store),
      toInputData(args.input2, this._textModelService, store),
    ])

    store.add(base)
    store.add(result)

    if (!resultTextFileModel) {
      throw new BugIndicatingError()
    }
    // So that "Don't save" does revert the file
    await resultTextFileModel.save({
      source: WorkspaceMergeEditorModeFactory.FILE_SAVED_SOURCE,
    })

    const lines = resultTextFileModel.textEditorModel!.getLinesContent()
    const hasConflictMarkers = lines.some((l) =>
      l.startsWith(conflictMarkers.start),
    )
    const resetResult = hasConflictMarkers

    const mergeDiffComputer =
      this._instantiationService.createInstance(MergeDiffComputer)

    const model = this._instantiationService.createInstance(
      MergeEditorModel,
      base.object.textEditorModel,
      input1Data,
      input2Data,
      result.object.textEditorModel,
      mergeDiffComputer,
      {
        resetResult,
      },
      this._mergeEditorTelemetry,
    )
    store.add(model)

    await model.onInitialized

    return this._instantiationService.createInstance(
      WorkspaceMergeEditorInputModel,
      model,
      store,
      resultTextFileModel,
      this._mergeEditorTelemetry,
    )
  }
}

class WorkspaceMergeEditorInputModel
  extends EditorModel
  implements IMergeEditorInputModel
{
  public readonly isDirty = observableFromEvent(
    Event.any(
      this.resultTextFileModel.onDidChangeDirty,
      this.resultTextFileModel.onDidSaveError,
    ),
    () => /** @description isDirty */ this.resultTextFileModel.isDirty(),
  )

  private reported = false
  private readonly dateTimeOpened = new Date()

  constructor(
    public readonly model: MergeEditorModel,
    private readonly disposableStore: DisposableStore,
    private readonly resultTextFileModel: ITextFileEditorModel,
    private readonly telemetry: MergeEditorTelemetry,
    @IDialogService private readonly _dialogService: IDialogService,
    @IStorageService private readonly _storageService: IStorageService,
  ) {
    super()
  }

  public override dispose(): void {
    this.disposableStore.dispose()
    super.dispose()

    this.reportClose(false)
  }

  private reportClose(accepted: boolean): void {
    if (!this.reported) {
      const remainingConflictCount = this.model.unhandledConflictsCount.get()
      const durationOpenedMs =
        new Date().getTime() - this.dateTimeOpened.getTime()
      this.telemetry.reportMergeEditorClosed({
        durationOpenedSecs: durationOpenedMs / 1000,
        remainingConflictCount,
        accepted,

        conflictCount: this.model.conflictCount,
        combinableConflictCount: this.model.combinableConflictCount,

        conflictsResolvedWithBase: this.model.conflictsResolvedWithBase,
        conflictsResolvedWithInput1: this.model.conflictsResolvedWithInput1,
        conflictsResolvedWithInput2: this.model.conflictsResolvedWithInput2,
        conflictsResolvedWithSmartCombination:
          this.model.conflictsResolvedWithSmartCombination,

        manuallySolvedConflictCountThatEqualNone:
          this.model.manuallySolvedConflictCountThatEqualNone,
        manuallySolvedConflictCountThatEqualSmartCombine:
          this.model.manuallySolvedConflictCountThatEqualSmartCombine,
        manuallySolvedConflictCountThatEqualInput1:
          this.model.manuallySolvedConflictCountThatEqualInput1,
        manuallySolvedConflictCountThatEqualInput2:
          this.model.manuallySolvedConflictCountThatEqualInput2,

        manuallySolvedConflictCountThatEqualNoneAndStartedWithBase:
          this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBase,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1:
          this.model
            .manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2:
          this.model
            .manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart:
          this.model
            .manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart:
          this.model
            .manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart,
      })
      this.reported = true
    }
  }

  public async accept(): Promise<void> {
    this.reportClose(true)
    await this.resultTextFileModel.save()
  }

  get resultUri(): URI {
    return this.resultTextFileModel.resource
  }

  async save(options?: ITextFileSaveOptions): Promise<void> {
    await this.resultTextFileModel.save(options)
  }

  /**
   * If save resets the dirty state, revert must do so too.
   */
  async revert(options?: IRevertOptions): Promise<void> {
    await this.resultTextFileModel.revert(options)
  }

  shouldConfirmClose(): boolean {
    // Always confirm
    return true
  }

  async confirmClose(
    inputModels: IMergeEditorInputModel[],
  ): Promise<ConfirmResult> {
    const isMany = inputModels.length > 1
    const someDirty = inputModels.some((m) => m.isDirty.get())
    const someUnhandledConflicts = inputModels.some((m) =>
      m.model.hasUnhandledConflicts.get(),
    )
    if (someDirty) {
      const message = isMany
        ? localize(
            "workspace.messageN",
            "Do you want to save the changes you made to {0} files?",
            inputModels.length,
          )
        : localize(
            "workspace.message1",
            "Do you want to save the changes you made to {0}?",
            basename(inputModels[0].resultUri),
          )
      const { result } = await this._dialogService.prompt<ConfirmResult>({
        type: Severity.Info,
        message,
        detail: someUnhandledConflicts
          ? isMany
            ? localize(
                "workspace.detailN.unhandled",
                "The files contain unhandled conflicts. Your changes will be lost if you don't save them.",
              )
            : localize(
                "workspace.detail1.unhandled",
                "The file contains unhandled conflicts. Your changes will be lost if you don't save them.",
              )
          : isMany
            ? localize(
                "workspace.detailN.handled",
                "Your changes will be lost if you don't save them.",
              )
            : localize(
                "workspace.detail1.handled",
                "Your changes will be lost if you don't save them.",
              ),
        buttons: [
          {
            label: someUnhandledConflicts
              ? localize(
                  {
                    key: "workspace.saveWithConflict",
                    comment: ["&& denotes a mnemonic"],
                  },
                  "&&Save with Conflicts",
                )
              : localize(
                  { key: "workspace.save", comment: ["&& denotes a mnemonic"] },
                  "&&Save",
                ),
            run: () => ConfirmResult.SAVE,
          },
          {
            label: localize(
              {
                key: "workspace.doNotSave",
                comment: ["&& denotes a mnemonic"],
              },
              "Do&&n't Save",
            ),
            run: () => ConfirmResult.DONT_SAVE,
          },
        ],
        cancelButton: {
          run: () => ConfirmResult.CANCEL,
        },
      })
      return result
    } else if (
      someUnhandledConflicts &&
      !this._storageService.getBoolean(
        StorageCloseWithConflicts,
        StorageScope.PROFILE,
        false,
      )
    ) {
      const { confirmed, checkboxChecked } = await this._dialogService.confirm({
        message: isMany
          ? localize(
              "workspace.messageN.nonDirty",
              "Do you want to close {0} merge editors?",
              inputModels.length,
            )
          : localize(
              "workspace.message1.nonDirty",
              "Do you want to close the merge editor for {0}?",
              basename(inputModels[0].resultUri),
            ),
        detail: someUnhandledConflicts
          ? isMany
            ? localize(
                "workspace.detailN.unhandled.nonDirty",
                "The files contain unhandled conflicts.",
              )
            : localize(
                "workspace.detail1.unhandled.nonDirty",
                "The file contains unhandled conflicts.",
              )
          : undefined,
        primaryButton: someUnhandledConflicts
          ? localize(
              {
                key: "workspace.closeWithConflicts",
                comment: ["&& denotes a mnemonic"],
              },
              "&&Close with Conflicts",
            )
          : localize(
              { key: "workspace.close", comment: ["&& denotes a mnemonic"] },
              "&&Close",
            ),
        checkbox: { label: localize("noMoreWarn", "Do not ask me again") },
      })

      if (checkboxChecked) {
        this._storageService.store(
          StorageCloseWithConflicts,
          true,
          StorageScope.PROFILE,
          StorageTarget.USER,
        )
      }

      return confirmed ? ConfirmResult.SAVE : ConfirmResult.CANCEL
    } else {
      // This shouldn't do anything
      return ConfirmResult.SAVE
    }
  }
}

/* ================= Utils ================== */

async function toInputData(
  data: MergeEditorInputData,
  textModelService: ITextModelService,
  store: DisposableStore,
): Promise<InputData> {
  const ref = await textModelService.createModelReference(data.uri)
  store.add(ref)
  return {
    textModel: ref.object.textEditorModel,
    title: data.title,
    description: data.description,
    detail: data.detail,
  }
}
