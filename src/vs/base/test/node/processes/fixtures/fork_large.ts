/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as processes from "vs/base/node/processes"

const sender = processes.createQueuedSender(<any>process)

process.on("message", (msg) => {
  sender.send(msg)
  sender.send(msg)
  sender.send(msg)
  sender.send("done")
})

sender.send("ready")
