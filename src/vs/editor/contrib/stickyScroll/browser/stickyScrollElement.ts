/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from "vs/base/common/uri"

export class StickyRange {
  constructor(
    public readonly startLineNumber: number,
    public readonly endLineNumber: number,
  ) {}
}

export class StickyElement {
  constructor(
    /**
     * Range of line numbers spanned by the current scope
     */
    public readonly range: StickyRange | undefined,
    /**
     * Must be sorted by start line number
     */
    public readonly children: StickyElement[],
    /**
     * Parent sticky outline element
     */
    public readonly parent: StickyElement | undefined,
  ) {}
}

export class StickyModel {
  constructor(
    readonly uri: URI,
    readonly version: number,
    readonly element: StickyElement | undefined,
    readonly outlineProviderId: string | undefined,
  ) {}
}
