"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the Functional Source License. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Temp = void 0;
exports.main = main;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class Temp {
    _files = [];
    tmpNameSync() {
        const file = path.join(os.tmpdir(), crypto.randomBytes(20).toString("hex"));
        this._files.push(file);
        return file;
    }
    dispose() {
        for (const file of this._files) {
            try {
                fs.unlinkSync(file);
            }
            catch (err) {
                // noop
            }
        }
    }
}
exports.Temp = Temp;
function getParams(type) {
    switch (type) {
        case "sign-windows":
            return [
                {
                    keyCode: "CP-230012",
                    operationSetCode: "SigntoolSign",
                    parameters: [
                        { parameterName: "OpusName", parameterValue: "VS Code" },
                        {
                            parameterName: "OpusInfo",
                            parameterValue: "https://code.visualstudio.com/",
                        },
                        { parameterName: "Append", parameterValue: "/as" },
                        { parameterName: "FileDigest", parameterValue: '/fd "SHA256"' },
                        { parameterName: "PageHash", parameterValue: "/NPH" },
                        {
                            parameterName: "TimeStamp",
                            parameterValue: '/tr "http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer" /td sha256',
                        },
                    ],
                    toolName: "sign",
                    toolVersion: "1.0",
                },
                {
                    keyCode: "CP-230012",
                    operationSetCode: "SigntoolVerify",
                    parameters: [{ parameterName: "VerifyAll", parameterValue: "/all" }],
                    toolName: "sign",
                    toolVersion: "1.0",
                },
            ];
        case "sign-windows-appx":
            return [
                {
                    keyCode: "CP-229979",
                    operationSetCode: "SigntoolSign",
                    parameters: [
                        { parameterName: "OpusName", parameterValue: "VS Code" },
                        {
                            parameterName: "OpusInfo",
                            parameterValue: "https://code.visualstudio.com/",
                        },
                        { parameterName: "FileDigest", parameterValue: '/fd "SHA256"' },
                        { parameterName: "PageHash", parameterValue: "/NPH" },
                        {
                            parameterName: "TimeStamp",
                            parameterValue: '/tr "http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer" /td sha256',
                        },
                    ],
                    toolName: "sign",
                    toolVersion: "1.0",
                },
                {
                    keyCode: "CP-229979",
                    operationSetCode: "SigntoolVerify",
                    parameters: [],
                    toolName: "sign",
                    toolVersion: "1.0",
                },
            ];
        case "sign-pgp":
            return [
                {
                    keyCode: "CP-450779-Pgp",
                    operationSetCode: "LinuxSign",
                    parameters: [],
                    toolName: "sign",
                    toolVersion: "1.0",
                },
            ];
        case "sign-darwin":
            return [
                {
                    keyCode: "CP-401337-Apple",
                    operationSetCode: "MacAppDeveloperSign",
                    parameters: [
                        { parameterName: "Hardening", parameterValue: "--options=runtime" },
                    ],
                    toolName: "sign",
                    toolVersion: "1.0",
                },
            ];
        case "notarize-darwin":
            return [
                {
                    keyCode: "CP-401337-Apple",
                    operationSetCode: "MacAppNotarize",
                    parameters: [],
                    toolName: "sign",
                    toolVersion: "1.0",
                },
            ];
        default:
            throw new Error(`Sign type ${type} not found`);
    }
}
function main([esrpCliPath, type, cert, username, password, folderPath, pattern,]) {
    const tmp = new Temp();
    process.on("exit", () => tmp.dispose());
    const patternPath = tmp.tmpNameSync();
    fs.writeFileSync(patternPath, pattern);
    const paramsPath = tmp.tmpNameSync();
    fs.writeFileSync(paramsPath, JSON.stringify(getParams(type)));
    const keyFile = tmp.tmpNameSync();
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    fs.writeFileSync(keyFile, JSON.stringify({ key: key.toString("hex"), iv: iv.toString("hex") }));
    const clientkeyPath = tmp.tmpNameSync();
    const clientkeyCypher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let clientkey = clientkeyCypher.update(password, "utf8", "hex");
    clientkey += clientkeyCypher.final("hex");
    fs.writeFileSync(clientkeyPath, clientkey);
    const clientcertPath = tmp.tmpNameSync();
    const clientcertCypher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let clientcert = clientcertCypher.update(cert, "utf8", "hex");
    clientcert += clientcertCypher.final("hex");
    fs.writeFileSync(clientcertPath, clientcert);
    const args = [
        esrpCliPath,
        "vsts.sign",
        "-a",
        username,
        "-k",
        clientkeyPath,
        "-z",
        clientcertPath,
        "-f",
        folderPath,
        "-p",
        patternPath,
        "-u",
        "false",
        "-x",
        "regularSigning",
        "-b",
        "input.json",
        "-l",
        "AzSecPack_PublisherPolicyProd.xml",
        "-y",
        "inlineSignParams",
        "-j",
        paramsPath,
        "-c",
        "9997",
        "-t",
        "120",
        "-g",
        "10",
        "-v",
        "Tls12",
        "-s",
        "https://api.esrp.microsoft.com/api/v1",
        "-m",
        "0",
        "-o",
        "Microsoft",
        "-i",
        "https://www.microsoft.com",
        "-n",
        "5",
        "-r",
        "true",
        "-e",
        keyFile,
    ];
    try {
        cp.execFileSync("dotnet", args, { stdio: "inherit" });
    }
    catch (err) {
        console.error("ESRP failed");
        console.error(err);
        process.exit(1);
    }
}
if (require.main === module) {
    main(process.argv.slice(2));
    process.exit(0);
}
//# sourceMappingURL=sign.js.map