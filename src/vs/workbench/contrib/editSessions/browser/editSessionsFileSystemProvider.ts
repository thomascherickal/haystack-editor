/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from "vs/base/common/lifecycle"
import { Event } from "vs/base/common/event"
import { URI } from "vs/base/common/uri"
import {
  FilePermission,
  FileSystemProviderCapabilities,
  FileSystemProviderErrorCode,
  FileType,
  IFileDeleteOptions,
  IFileOverwriteOptions,
  IFileSystemProviderWithFileReadWriteCapability,
  IStat,
  IWatchOptions,
} from "vs/platform/files/common/files"
import {
  ChangeType,
  decodeEditSessionFileContent,
  EDIT_SESSIONS_SCHEME,
  EditSession,
  IEditSessionsStorageService,
} from "vs/workbench/contrib/editSessions/common/editSessions"
import { NotSupportedError } from "vs/base/common/errors"

export class EditSessionsFileSystemProvider
  implements IFileSystemProviderWithFileReadWriteCapability
{
  static readonly SCHEMA = EDIT_SESSIONS_SCHEME

  constructor(
    @IEditSessionsStorageService
    private editSessionsStorageService: IEditSessionsStorageService,
  ) {}

  readonly capabilities: FileSystemProviderCapabilities =
    FileSystemProviderCapabilities.Readonly +
    FileSystemProviderCapabilities.FileReadWrite

  async readFile(resource: URI): Promise<Uint8Array> {
    const match = /(?<ref>[^/]+)\/(?<folderName>[^/]+)\/(?<filePath>.*)/.exec(
      resource.path.substring(1),
    )
    if (!match?.groups) {
      throw FileSystemProviderErrorCode.FileNotFound
    }
    const { ref, folderName, filePath } = match.groups
    const data = await this.editSessionsStorageService.read("editSessions", ref)
    if (!data) {
      throw FileSystemProviderErrorCode.FileNotFound
    }
    const content: EditSession = JSON.parse(data.content)
    const change = content.folders
      .find((f) => f.name === folderName)
      ?.workingChanges.find((change) => change.relativeFilePath === filePath)
    if (!change || change.type === ChangeType.Deletion) {
      throw FileSystemProviderErrorCode.FileNotFound
    }
    return decodeEditSessionFileContent(content.version, change.contents).buffer
  }

  async stat(resource: URI): Promise<IStat> {
    const content = await this.readFile(resource)
    const currentTime = Date.now()
    return {
      type: FileType.File,
      permissions: FilePermission.Readonly,
      mtime: currentTime,
      ctime: currentTime,
      size: content.byteLength,
    }
  }

  //#region Unsupported file operations
  readonly onDidChangeCapabilities = Event.None
  readonly onDidChangeFile = Event.None

  watch(resource: URI, opts: IWatchOptions): IDisposable {
    return Disposable.None
  }

  async mkdir(resource: URI): Promise<void> {}
  async readdir(resource: URI): Promise<[string, FileType][]> {
    return []
  }

  async rename(
    from: URI,
    to: URI,
    opts: IFileOverwriteOptions,
  ): Promise<void> {}
  async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {}

  async writeFile() {
    throw new NotSupportedError()
  }
  //#endregion
}
