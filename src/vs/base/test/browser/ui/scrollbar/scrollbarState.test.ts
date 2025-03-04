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
import { ScrollbarState } from "vs/base/browser/ui/scrollbar/scrollbarState"
import { ensureNoDisposablesAreLeakedInTestSuite } from "vs/base/test/common/utils"

suite("ScrollbarState", () => {
  ensureNoDisposablesAreLeakedInTestSuite()

  test("inflates slider size", () => {
    const actual = new ScrollbarState(0, 14, 0, 339, 42423, 32787)

    assert.strictEqual(actual.getArrowSize(), 0)
    assert.strictEqual(actual.getScrollPosition(), 32787)
    assert.strictEqual(actual.getRectangleLargeSize(), 339)
    assert.strictEqual(actual.getRectangleSmallSize(), 14)
    assert.strictEqual(actual.isNeeded(), true)
    assert.strictEqual(actual.getSliderSize(), 20)
    assert.strictEqual(actual.getSliderPosition(), 249)

    assert.strictEqual(actual.getDesiredScrollPositionFromOffset(259), 32849)

    // 259 is greater than 230 so page down, 32787 + 339 =  33126
    assert.strictEqual(
      actual.getDesiredScrollPositionFromOffsetPaged(259),
      33126,
    )

    actual.setScrollPosition(32849)
    assert.strictEqual(actual.getArrowSize(), 0)
    assert.strictEqual(actual.getScrollPosition(), 32849)
    assert.strictEqual(actual.getRectangleLargeSize(), 339)
    assert.strictEqual(actual.getRectangleSmallSize(), 14)
    assert.strictEqual(actual.isNeeded(), true)
    assert.strictEqual(actual.getSliderSize(), 20)
    assert.strictEqual(actual.getSliderPosition(), 249)
  })

  test("inflates slider size with arrows", () => {
    const actual = new ScrollbarState(12, 14, 0, 339, 42423, 32787)

    assert.strictEqual(actual.getArrowSize(), 12)
    assert.strictEqual(actual.getScrollPosition(), 32787)
    assert.strictEqual(actual.getRectangleLargeSize(), 339)
    assert.strictEqual(actual.getRectangleSmallSize(), 14)
    assert.strictEqual(actual.isNeeded(), true)
    assert.strictEqual(actual.getSliderSize(), 20)
    assert.strictEqual(actual.getSliderPosition(), 230)

    assert.strictEqual(
      actual.getDesiredScrollPositionFromOffset(240 + 12),
      32811,
    )

    // 240 + 12 = 252; greater than 230 so page down, 32787 + 339 =  33126
    assert.strictEqual(
      actual.getDesiredScrollPositionFromOffsetPaged(240 + 12),
      33126,
    )

    actual.setScrollPosition(32811)
    assert.strictEqual(actual.getArrowSize(), 12)
    assert.strictEqual(actual.getScrollPosition(), 32811)
    assert.strictEqual(actual.getRectangleLargeSize(), 339)
    assert.strictEqual(actual.getRectangleSmallSize(), 14)
    assert.strictEqual(actual.isNeeded(), true)
    assert.strictEqual(actual.getSliderSize(), 20)
    assert.strictEqual(actual.getSliderPosition(), 230)
  })
})
