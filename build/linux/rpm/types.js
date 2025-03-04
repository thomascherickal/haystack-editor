"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the Functional Source License. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRpmArchString = isRpmArchString;
function isRpmArchString(s) {
    return ["x86_64", "armv7hl", "aarch64"].includes(s);
}
//# sourceMappingURL=types.js.map