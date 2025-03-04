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

export class DebugCompoundRoot {
  private stopped = false
  private stopEmitter = new Emitter<void>()

  onDidSessionStop = this.stopEmitter.event

  sessionStopped(): void {
    if (!this.stopped) {
      // avoid sending extranous terminate events
      this.stopped = true
      this.stopEmitter.fire()
    }
  }
}
