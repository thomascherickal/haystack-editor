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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const es = __importStar(require("event-stream"));
const vfs = __importStar(require("vinyl-fs"));
const gulp_merge_json_1 = __importDefault(require("gulp-merge-json"));
const gulp_gzip_1 = __importDefault(require("gulp-gzip"));
const identity_1 = require("@azure/identity");
const path = require("path");
const fs_1 = require("fs");
const azure = require("gulp-azure-storage");
const commit = process.env["BUILD_SOURCEVERSION"];
const credential = new identity_1.ClientSecretCredential(process.env["AZURE_TENANT_ID"], process.env["AZURE_CLIENT_ID"], process.env["AZURE_CLIENT_SECRET"]);
function main() {
    return new Promise((c, e) => {
        es.merge(vfs.src("out-vscode-web-min/nls.metadata.json", {
            base: "out-vscode-web-min",
        }), vfs.src(".build/extensions/**/nls.metadata.json", {
            base: ".build/extensions",
        }), vfs.src(".build/extensions/**/nls.metadata.header.json", {
            base: ".build/extensions",
        }), vfs.src(".build/extensions/**/package.nls.json", {
            base: ".build/extensions",
        }))
            .pipe((0, gulp_merge_json_1.default)({
            fileName: "combined.nls.metadata.json",
            jsonSpace: "",
            concatArrays: true,
            edit: (parsedJson, file) => {
                if (file.base === "out-vscode-web-min") {
                    return { vscode: parsedJson };
                }
                // Handle extensions and follow the same structure as the Core nls file.
                switch (file.basename) {
                    case "package.nls.json":
                        // put package.nls.json content in Core NlsMetadata format
                        // language packs use the key "package" to specify that
                        // translations are for the package.json file
                        parsedJson = {
                            messages: {
                                package: Object.values(parsedJson),
                            },
                            keys: {
                                package: Object.keys(parsedJson),
                            },
                            bundles: {
                                main: ["package"],
                            },
                        };
                        break;
                    case "nls.metadata.header.json":
                        parsedJson = { header: parsedJson };
                        break;
                    case "nls.metadata.json": {
                        // put nls.metadata.json content in Core NlsMetadata format
                        const modules = Object.keys(parsedJson);
                        const json = {
                            keys: {},
                            messages: {},
                            bundles: {
                                main: [],
                            },
                        };
                        for (const module of modules) {
                            json.messages[module] = parsedJson[module].messages;
                            json.keys[module] = parsedJson[module].keys;
                            json.bundles.main.push(module);
                        }
                        parsedJson = json;
                        break;
                    }
                }
                // Get extension id and use that as the key
                const folderPath = path.join(file.base, file.relative.split("/")[0]);
                const manifest = (0, fs_1.readFileSync)(path.join(folderPath, "package.json"), "utf-8");
                const manifestJson = JSON.parse(manifest);
                const key = manifestJson.publisher + "." + manifestJson.name;
                return { [key]: parsedJson };
            },
        }))
            .pipe((0, gulp_gzip_1.default)({ append: false }))
            .pipe(vfs.dest("./nlsMetadata"))
            .pipe(es.through(function (data) {
            console.log(`Uploading ${data.path}`);
            // trigger artifact upload
            console.log(`##vso[artifact.upload containerfolder=nlsmetadata;artifactname=combined.nls.metadata.json]${data.path}`);
            this.emit("data", data);
        }))
            .pipe(azure.upload({
            account: process.env.AZURE_STORAGE_ACCOUNT,
            credential,
            container: "nlsmetadata",
            prefix: commit + "/",
            contentSettings: {
                contentEncoding: "gzip",
                cacheControl: "max-age=31536000, public",
            },
        }))
            .on("end", () => c())
            .on("error", (err) => e(err));
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=upload-nlsmetadata.js.map