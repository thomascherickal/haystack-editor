/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findLastMonotonous } from "vs/base/common/arraysFind"
import { Position } from "vs/editor/common/core/position"
import { Range } from "vs/editor/common/core/range"
import { TextLength } from "vs/editor/common/core/textLength"

/**
 * Represents a list of mappings of ranges from one document to another.
 */
export class RangeMapping {
  constructor(public readonly mappings: readonly SingleRangeMapping[]) {}

  mapPosition(position: Position): PositionOrRange {
    const mapping = findLastMonotonous(this.mappings, (m) =>
      m.original.getStartPosition().isBeforeOrEqual(position),
    )
    if (!mapping) {
      return PositionOrRange.position(position)
    }
    if (mapping.original.containsPosition(position)) {
      return PositionOrRange.range(mapping.modified)
    }
    const l = TextLength.betweenPositions(
      mapping.original.getEndPosition(),
      position,
    )
    return PositionOrRange.position(
      l.addToPosition(mapping.modified.getEndPosition()),
    )
  }

  mapRange(range: Range): Range {
    const start = this.mapPosition(range.getStartPosition())
    const end = this.mapPosition(range.getEndPosition())
    return Range.fromPositions(
      start.range?.getStartPosition() ?? start.position!,
      end.range?.getEndPosition() ?? end.position!,
    )
  }

  reverse(): RangeMapping {
    return new RangeMapping(this.mappings.map((mapping) => mapping.reverse()))
  }
}

export class SingleRangeMapping {
  constructor(
    public readonly original: Range,
    public readonly modified: Range,
  ) {}

  reverse(): SingleRangeMapping {
    return new SingleRangeMapping(this.modified, this.original)
  }

  toString() {
    return `${this.original.toString()} -> ${this.modified.toString()}`
  }
}

export class PositionOrRange {
  public static position(position: Position): PositionOrRange {
    return new PositionOrRange(position, undefined)
  }

  public static range(range: Range): PositionOrRange {
    return new PositionOrRange(undefined, range)
  }

  private constructor(
    public readonly position: Position | undefined,
    public readonly range: Range | undefined,
  ) {}
}
