/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module "vscode" {
  export namespace authentication {
    /**
     * @deprecated Use {@link getSession()} {@link AuthenticationGetSessionOptions.silent} instead.
     */
    export function hasSession(
      providerId: string,
      scopes: readonly string[],
    ): Thenable<boolean>
  }
}
