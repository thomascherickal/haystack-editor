/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  AbstractSignService,
  IVsdaValidator,
} from "vs/platform/sign/common/abstractSignService"
import { ISignService } from "vs/platform/sign/common/sign"

declare module vsda {
  // the signer is a native module that for historical reasons uses a lower case class name
  // eslint-disable-next-line @typescript-eslint/naming-convention
  export class signer {
    sign(arg: string): string
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  export class validator {
    createNewMessage(arg: string): string
    validate(arg: string): "ok" | "error"
  }
}

export class SignService extends AbstractSignService implements ISignService {
  protected override getValidator(): Promise<IVsdaValidator> {
    return this.vsda().then((vsda) => new vsda.validator())
  }
  protected override signValue(arg: string): Promise<string> {
    return this.vsda().then((vsda) => new vsda.signer().sign(arg))
  }

  private vsda(): Promise<typeof vsda> {
    return new Promise((resolve, reject) => require(["vsda"], resolve, reject))
  }
}
