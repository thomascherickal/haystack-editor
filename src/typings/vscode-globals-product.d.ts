/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AMD2ESM mirgation relevant

declare global {
  /**
   * @deprecated You MUST use `IProductService` whenever possible.
   */
  var _HAYSTACK_PRODUCT_JSON: Record<string, any>
  /**
   * @deprecated You MUST use `IProductService` whenever possible.
   */
  var _HAYSTACK_PACKAGE_JSON: Record<string, any>
}

// fake export to make global work
export {}
