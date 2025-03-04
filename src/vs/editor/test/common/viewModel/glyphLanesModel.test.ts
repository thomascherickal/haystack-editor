/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert"
import { ensureNoDisposablesAreLeakedInTestSuite } from "vs/base/test/common/utils"
import { GlyphMarginLanesModel } from "vs/editor/common/viewModel/glyphLanesModel"
import { Range } from "vs/editor/common/core/range"
import { GlyphMarginLane } from "vs/editor/common/model"

suite("GlyphLanesModel", () => {
  let model: GlyphMarginLanesModel

  ensureNoDisposablesAreLeakedInTestSuite()

  const lineRange = (startLineNumber: number, endLineNumber: number) =>
    new Range(startLineNumber, 1, endLineNumber, 1)
  const assertLines = (
    fromLine: number,
    n: number,
    expected: GlyphMarginLane[][],
  ) => {
    const result: GlyphMarginLane[][] = []
    for (let i = 0; i < n; i++) {
      result.push(model.getLanesAtLine(fromLine + i))
    }
    assert.deepStrictEqual(result, expected, `fromLine: ${fromLine}, n: ${n}`)
  }

  setup(() => {
    model = new GlyphMarginLanesModel(10)
  })

  test("handles empty", () => {
    assert.equal(model.requiredLanes, 1)
    assertLines(1, 1, [[GlyphMarginLane.Center]])
  })

  test("works with a single line range", () => {
    model.push(GlyphMarginLane.Left, lineRange(2, 3))
    assert.equal(model.requiredLanes, 1)
    assertLines(1, 5, [
      [GlyphMarginLane.Center], // 1
      [GlyphMarginLane.Left], // 2
      [GlyphMarginLane.Left], // 3
      [GlyphMarginLane.Center], // 4
      [GlyphMarginLane.Center], // 5
    ])
  })

  test("persists ranges", () => {
    model.push(GlyphMarginLane.Left, lineRange(2, 3), true)
    assert.equal(model.requiredLanes, 1)
    assertLines(1, 5, [
      [GlyphMarginLane.Left], // 1
      [GlyphMarginLane.Left], // 2
      [GlyphMarginLane.Left], // 3
      [GlyphMarginLane.Left], // 4
      [GlyphMarginLane.Left], // 5
    ])
  })

  test("handles overlaps", () => {
    model.push(GlyphMarginLane.Left, lineRange(6, 9))
    model.push(GlyphMarginLane.Right, lineRange(5, 7))
    model.push(GlyphMarginLane.Center, lineRange(7, 8))
    assert.equal(model.requiredLanes, 3)
    assertLines(5, 6, [
      [GlyphMarginLane.Right], // 5
      [GlyphMarginLane.Left, GlyphMarginLane.Right], // 6
      [GlyphMarginLane.Left, GlyphMarginLane.Center, GlyphMarginLane.Right], // 7
      [GlyphMarginLane.Left, GlyphMarginLane.Center], // 8
      [GlyphMarginLane.Left], // 9
      [GlyphMarginLane.Center], // 10
    ])
  })
})
