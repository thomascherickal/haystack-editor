/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fail, strictEqual } from "assert"
import { ensureNoDisposablesAreLeakedInTestSuite } from "vs/base/test/common/utils"
import { TestInstantiationService } from "vs/platform/instantiation/test/common/instantiationServiceMock"
import { ConsoleLogger, ILogService } from "vs/platform/log/common/log"
import { LogService } from "vs/platform/log/common/logService"
import { RequestStore } from "vs/platform/terminal/common/requestStore"

suite("RequestStore", () => {
  let instantiationService: TestInstantiationService

  setup(() => {
    instantiationService = new TestInstantiationService()
    instantiationService.stub(ILogService, new LogService(new ConsoleLogger()))
  })

  const store = ensureNoDisposablesAreLeakedInTestSuite()

  test("should resolve requests", async () => {
    const requestStore: RequestStore<{ data: string }, { arg: string }> =
      store.add(
        instantiationService.createInstance(
          RequestStore<{ data: string }, { arg: string }>,
          undefined,
        ),
      )
    let eventArgs: { requestId: number; arg: string } | undefined
    store.add(requestStore.onCreateRequest((e) => (eventArgs = e)))
    const request = requestStore.createRequest({ arg: "foo" })
    strictEqual(typeof eventArgs?.requestId, "number")
    strictEqual(eventArgs?.arg, "foo")
    requestStore.acceptReply(eventArgs.requestId, { data: "bar" })
    const result = await request
    strictEqual(result.data, "bar")
  })

  test("should reject the promise when the request times out", async () => {
    const requestStore: RequestStore<{ data: string }, { arg: string }> =
      store.add(
        instantiationService.createInstance(
          RequestStore<{ data: string }, { arg: string }>,
          1,
        ),
      )
    const request = requestStore.createRequest({ arg: "foo" })
    let threw = false
    try {
      await request
    } catch (e) {
      threw = true
    }
    if (!threw) {
      fail()
    }
  })
})
