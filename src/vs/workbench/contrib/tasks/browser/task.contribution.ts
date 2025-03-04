/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Haystack Software Inc. All rights reserved.
 *  Licensed under the PolyForm Strict License 1.0.0. See License.txt in the project root for
 *  license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See code-license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from "vs/nls"

import { Disposable } from "vs/base/common/lifecycle"
import { Registry } from "vs/platform/registry/common/platform"
import { LifecyclePhase } from "vs/workbench/services/lifecycle/common/lifecycle"
import {
  MenuRegistry,
  MenuId,
  registerAction2,
} from "vs/platform/actions/common/actions"

import { ProblemMatcherRegistry } from "vs/workbench/contrib/tasks/common/problemMatcher"
import {
  IProgressService,
  ProgressLocation,
} from "vs/platform/progress/common/progress"

import * as jsonContributionRegistry from "vs/platform/jsonschemas/common/jsonContributionRegistry"
import { IJSONSchema } from "vs/base/common/jsonSchema"

import {
  StatusbarAlignment,
  IStatusbarService,
  IStatusbarEntryAccessor,
  IStatusbarEntry,
} from "vs/workbench/services/statusbar/browser/statusbar"

import {
  IOutputChannelRegistry,
  Extensions as OutputExt,
} from "vs/workbench/services/output/common/output"

import {
  ITaskEvent,
  TaskEventKind,
  TaskGroup,
  TaskSettingId,
  TASKS_CATEGORY,
  TASK_RUNNING_STATE,
} from "vs/workbench/contrib/tasks/common/tasks"
import {
  ITaskService,
  TaskCommandsRegistered,
  TaskExecutionSupportedContext,
} from "vs/workbench/contrib/tasks/common/taskService"

import {
  Extensions as WorkbenchExtensions,
  IWorkbenchContributionsRegistry,
  IWorkbenchContribution,
} from "vs/workbench/common/contributions"
import {
  RunAutomaticTasks,
  ManageAutomaticTaskRunning,
} from "vs/workbench/contrib/tasks/browser/runAutomaticTasks"
import {
  KeybindingsRegistry,
  KeybindingWeight,
} from "vs/platform/keybinding/common/keybindingsRegistry"
import { KeyMod, KeyCode } from "vs/base/common/keyCodes"
import schemaVersion1 from "../common/jsonSchema_v1"
import schemaVersion2, {
  updateProblemMatchers,
  updateTaskDefinitions,
} from "../common/jsonSchema_v2"
import {
  AbstractTaskService,
  ConfigureTaskAction,
} from "vs/workbench/contrib/tasks/browser/abstractTaskService"
import { tasksSchemaId } from "vs/workbench/services/configuration/common/configuration"
import {
  Extensions as ConfigurationExtensions,
  IConfigurationRegistry,
} from "vs/platform/configuration/common/configurationRegistry"
import { WorkbenchStateContext } from "vs/workbench/common/contextkeys"
import {
  IQuickAccessRegistry,
  Extensions as QuickAccessExtensions,
} from "vs/platform/quickinput/common/quickAccess"
import { TasksQuickAccessProvider } from "vs/workbench/contrib/tasks/browser/tasksQuickAccess"
import { ContextKeyExpr } from "vs/platform/contextkey/common/contextkey"
import { TaskDefinitionRegistry } from "vs/workbench/contrib/tasks/common/taskDefinitionRegistry"
import { TerminalMenuBarGroup } from "vs/workbench/contrib/terminal/browser/terminalMenus"
import { isString } from "vs/base/common/types"
import { promiseWithResolvers } from "vs/base/common/async"

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(
  WorkbenchExtensions.Workbench,
)
workbenchRegistry.registerWorkbenchContribution(
  RunAutomaticTasks,
  LifecyclePhase.Eventually,
)

registerAction2(ManageAutomaticTaskRunning)
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ManageAutomaticTaskRunning.ID,
    title: ManageAutomaticTaskRunning.LABEL,
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})

export class TaskStatusBarContributions
  extends Disposable
  implements IWorkbenchContribution
{
  private _runningTasksStatusItem: IStatusbarEntryAccessor | undefined
  private _activeTasksCount: number = 0

  constructor(
    @ITaskService private readonly _taskService: ITaskService,
    @IStatusbarService private readonly _statusbarService: IStatusbarService,
    @IProgressService private readonly _progressService: IProgressService,
  ) {
    super()
    this._registerListeners()
  }

  private _registerListeners(): void {
    let promise: Promise<void> | undefined = undefined
    let resolve: (value?: void | Thenable<void>) => void
    this._register(
      this._taskService.onDidStateChange((event) => {
        if (event.kind === TaskEventKind.Changed) {
          this._updateRunningTasksStatus()
        }

        if (!this._ignoreEventForUpdateRunningTasksCount(event)) {
          switch (event.kind) {
            case TaskEventKind.Active:
              this._activeTasksCount++
              if (this._activeTasksCount === 1) {
                if (!promise) {
                  ;({ promise, resolve } = promiseWithResolvers<void>())
                }
              }
              break
            case TaskEventKind.Inactive:
              // Since the exiting of the sub process is communicated async we can't order inactive and terminate events.
              // So try to treat them accordingly.
              if (this._activeTasksCount > 0) {
                this._activeTasksCount--
                if (this._activeTasksCount === 0) {
                  if (promise && resolve) {
                    resolve!()
                  }
                }
              }
              break
            case TaskEventKind.Terminated:
              if (this._activeTasksCount !== 0) {
                this._activeTasksCount = 0
                if (promise && resolve) {
                  resolve!()
                }
              }
              break
          }
        }

        if (
          promise &&
          event.kind === TaskEventKind.Active &&
          this._activeTasksCount === 1
        ) {
          this._progressService
            .withProgress(
              {
                location: ProgressLocation.Window,
                command: "workbench.action.tasks.showTasks",
                type: "loading",
              },
              (progress) => {
                progress.report({
                  message: nls.localize("building", "Building..."),
                })
                return promise!
              },
            )
            .then(() => {
              promise = undefined
            })
        }
      }),
    )
  }

  private async _updateRunningTasksStatus(): Promise<void> {
    const tasks = await this._taskService.getActiveTasks()
    if (tasks.length === 0) {
      if (this._runningTasksStatusItem) {
        this._runningTasksStatusItem.dispose()
        this._runningTasksStatusItem = undefined
      }
    } else {
      const itemProps: IStatusbarEntry = {
        name: nls.localize("status.runningTasks", "Running Tasks"),
        text: `$(tools) ${tasks.length}`,
        ariaLabel: nls.localize(
          "numberOfRunningTasks",
          "{0} running tasks",
          tasks.length,
        ),
        tooltip: nls.localize("runningTasks", "Show Running Tasks"),
        command: "workbench.action.tasks.showTasks",
      }

      if (!this._runningTasksStatusItem) {
        this._runningTasksStatusItem = this._statusbarService.addEntry(
          itemProps,
          "status.runningTasks",
          StatusbarAlignment.LEFT,
          49 /* Medium Priority, next to Markers */,
        )
      } else {
        this._runningTasksStatusItem.update(itemProps)
      }
    }
  }

  private _ignoreEventForUpdateRunningTasksCount(event: ITaskEvent): boolean {
    if (
      !this._taskService.inTerminal() ||
      event.kind === TaskEventKind.Changed
    ) {
      return false
    }

    if (
      (isString(event.group) ? event.group : event.group?._id) !==
      TaskGroup.Build._id
    ) {
      return true
    }

    return (
      event.__task.configurationProperties.problemMatchers === undefined ||
      event.__task.configurationProperties.problemMatchers.length === 0
    )
  }
}

workbenchRegistry.registerWorkbenchContribution(
  TaskStatusBarContributions,
  LifecyclePhase.Restored,
)

MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Run,
  command: {
    id: "workbench.action.tasks.runTask",
    title: nls.localize(
      { key: "miRunTask", comment: ["&& denotes a mnemonic"] },
      "&&Run Task...",
    ),
  },
  order: 1,
  when: TaskExecutionSupportedContext,
})

MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Run,
  command: {
    id: "workbench.action.tasks.build",
    title: nls.localize(
      { key: "miBuildTask", comment: ["&& denotes a mnemonic"] },
      "Run &&Build Task...",
    ),
  },
  order: 2,
  when: TaskExecutionSupportedContext,
})

// Manage Tasks
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.showTasks",
    title: nls.localize(
      { key: "miRunningTask", comment: ["&& denotes a mnemonic"] },
      "Show Runnin&&g Tasks...",
    ),
  },
  order: 1,
  when: TaskExecutionSupportedContext,
})

MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.restartTask",
    title: nls.localize(
      { key: "miRestartTask", comment: ["&& denotes a mnemonic"] },
      "R&&estart Running Task...",
    ),
  },
  order: 2,
  when: TaskExecutionSupportedContext,
})

MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.terminate",
    title: nls.localize(
      { key: "miTerminateTask", comment: ["&& denotes a mnemonic"] },
      "&&Terminate Task...",
    ),
  },
  order: 3,
  when: TaskExecutionSupportedContext,
})

// Configure Tasks
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Configure,
  command: {
    id: "workbench.action.tasks.configureTaskRunner",
    title: nls.localize(
      { key: "miConfigureTask", comment: ["&& denotes a mnemonic"] },
      "&&Configure Tasks...",
    ),
  },
  order: 1,
  when: TaskExecutionSupportedContext,
})

MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Configure,
  command: {
    id: "workbench.action.tasks.configureDefaultBuildTask",
    title: nls.localize(
      { key: "miConfigureBuildTask", comment: ["&& denotes a mnemonic"] },
      "Configure De&&fault Build Task...",
    ),
  },
  order: 2,
  when: TaskExecutionSupportedContext,
})

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.openWorkspaceFileTasks",
    title: nls.localize2(
      "workbench.action.tasks.openWorkspaceFileTasks",
      "Open Workspace Tasks",
    ),
    category: TASKS_CATEGORY,
  },
  when: ContextKeyExpr.and(
    WorkbenchStateContext.isEqualTo("workspace"),
    TaskExecutionSupportedContext,
  ),
})

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ConfigureTaskAction.ID,
    title: ConfigureTaskAction.TEXT,
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.showLog",
    title: nls.localize2("ShowLogAction.label", "Show Task Log"),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.runTask",
    title: nls.localize2("RunTaskAction.label", "Run Task"),
    category: TASKS_CATEGORY,
  },
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.reRunTask",
    title: nls.localize2("ReRunTaskAction.label", "Rerun Last Task"),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.restartTask",
    title: nls.localize2("RestartTaskAction.label", "Restart Running Task"),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.showTasks",
    title: nls.localize2("ShowTasksAction.label", "Show Running Tasks"),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.terminate",
    title: nls.localize2("TerminateAction.label", "Terminate Task"),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.build",
    title: nls.localize2("BuildAction.label", "Run Build Task"),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.test",
    title: nls.localize2("TestAction.label", "Run Test Task"),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.configureDefaultBuildTask",
    title: nls.localize2(
      "ConfigureDefaultBuildTask.label",
      "Configure Default Build Task",
    ),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.configureDefaultTestTask",
    title: nls.localize2(
      "ConfigureDefaultTestTask.label",
      "Configure Default Test Task",
    ),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.openUserTasks",
    title: nls.localize2(
      "workbench.action.tasks.openUserTasks",
      "Open User Tasks",
    ),
    category: TASKS_CATEGORY,
  },
  when: TaskExecutionSupportedContext,
})

class UserTasksGlobalActionContribution
  extends Disposable
  implements IWorkbenchContribution
{
  constructor() {
    super()
    this.registerActions()
  }

  private registerActions() {
    const id = "workbench.action.tasks.openUserTasks"
    const title = nls.localize("userTasks", "User Tasks")
    this._register(
      MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
        command: {
          id,
          title,
        },
        when: TaskExecutionSupportedContext,
        group: "2_configuration",
        order: 6,
      }),
    )
    this._register(
      MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
        command: {
          id,
          title,
        },
        when: TaskExecutionSupportedContext,
        group: "2_configuration",
        order: 6,
      }),
    )
  }
}
workbenchRegistry.registerWorkbenchContribution(
  UserTasksGlobalActionContribution,
  LifecyclePhase.Restored,
)

// MenuRegistry.addCommand( { id: 'workbench.action.tasks.rebuild', title: nls.localize('RebuildAction.label', 'Run Rebuild Task'), category: tasksCategory });
// MenuRegistry.addCommand( { id: 'workbench.action.tasks.clean', title: nls.localize('CleanAction.label', 'Run Clean Task'), category: tasksCategory });

KeybindingsRegistry.registerKeybindingRule({
  id: "workbench.action.tasks.build",
  weight: KeybindingWeight.WorkbenchContrib,
  when: TaskCommandsRegistered,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB,
})

// Tasks Output channel. Register it before using it in Task Service.
const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(
  OutputExt.OutputChannels,
)
outputChannelRegistry.registerChannel({
  id: AbstractTaskService.OutputChannelId,
  label: AbstractTaskService.OutputChannelLabel,
  log: false,
})

// Register Quick Access
const quickAccessRegistry = Registry.as<IQuickAccessRegistry>(
  QuickAccessExtensions.Quickaccess,
)
const tasksPickerContextKey = "inTasksPicker"

quickAccessRegistry.registerQuickAccessProvider({
  ctor: TasksQuickAccessProvider,
  prefix: TasksQuickAccessProvider.PREFIX,
  contextKey: tasksPickerContextKey,
  placeholder: nls.localize(
    "tasksQuickAccessPlaceholder",
    "Type the name of a task to run.",
  ),
  helpEntries: [
    {
      description: nls.localize("tasksQuickAccessHelp", "Run Task"),
      commandCenterOrder: 60,
    },
  ],
})

// tasks.json validation
const schema: IJSONSchema = {
  id: tasksSchemaId,
  description: "Task definition file",
  type: "object",
  allowTrailingCommas: true,
  allowComments: true,
  default: {
    version: "2.0.0",
    tasks: [
      {
        label: "My Task",
        command: "echo hello",
        type: "shell",
        args: [],
        problemMatcher: ["$tsc"],
        presentation: {
          reveal: "always",
        },
        group: "build",
      },
    ],
  },
}

schema.definitions = {
  ...schemaVersion1.definitions,
  ...schemaVersion2.definitions,
}
schema.oneOf = [
  ...(schemaVersion2.oneOf || []),
  ...(schemaVersion1.oneOf || []),
]

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>(
  Registry.as(jsonContributionRegistry.Extensions.JSONContribution)
)
jsonRegistry.registerSchema(tasksSchemaId, schema)

ProblemMatcherRegistry.onMatcherChanged(() => {
  updateProblemMatchers()
  jsonRegistry.notifySchemaChanged(tasksSchemaId)
})

TaskDefinitionRegistry.onDefinitionsChanged(() => {
  updateTaskDefinitions()
  jsonRegistry.notifySchemaChanged(tasksSchemaId)
})

const configurationRegistry = Registry.as<IConfigurationRegistry>(
  ConfigurationExtensions.Configuration,
)
configurationRegistry.registerConfiguration({
  id: "task",
  order: 100,
  title: nls.localize("tasksConfigurationTitle", "Tasks"),
  type: "object",
  properties: {
    [TaskSettingId.ProblemMatchersNeverPrompt]: {
      markdownDescription: nls.localize(
        "task.problemMatchers.neverPrompt",
        "Configures whether to show the problem matcher prompt when running a task. Set to `true` to never prompt, or use a dictionary of task types to turn off prompting only for specific task types.",
      ),
      oneOf: [
        {
          type: "boolean",
          markdownDescription: nls.localize(
            "task.problemMatchers.neverPrompt.boolean",
            "Sets problem matcher prompting behavior for all tasks.",
          ),
        },
        {
          type: "object",
          patternProperties: {
            ".*": {
              type: "boolean",
            },
          },
          markdownDescription: nls.localize(
            "task.problemMatchers.neverPrompt.array",
            "An object containing task type-boolean pairs to never prompt for problem matchers on.",
          ),
          default: {
            shell: true,
          },
        },
      ],
      default: false,
    },
    [TaskSettingId.AutoDetect]: {
      markdownDescription: nls.localize(
        "task.autoDetect",
        "Controls enablement of `provideTasks` for all task provider extension. If the Tasks: Run Task command is slow, disabling auto detect for task providers may help. Individual extensions may also provide settings that disable auto detection.",
      ),
      type: "string",
      enum: ["on", "off"],
      default: "on",
    },
    [TaskSettingId.SlowProviderWarning]: {
      markdownDescription: nls.localize(
        "task.slowProviderWarning",
        "Configures whether a warning is shown when a provider is slow",
      ),
      oneOf: [
        {
          type: "boolean",
          markdownDescription: nls.localize(
            "task.slowProviderWarning.boolean",
            "Sets the slow provider warning for all tasks.",
          ),
        },
        {
          type: "array",
          items: {
            type: "string",
            markdownDescription: nls.localize(
              "task.slowProviderWarning.array",
              "An array of task types to never show the slow provider warning.",
            ),
          },
        },
      ],
      default: true,
    },
    [TaskSettingId.QuickOpenHistory]: {
      markdownDescription: nls.localize(
        "task.quickOpen.history",
        "Controls the number of recent items tracked in task quick open dialog.",
      ),
      type: "number",
      default: 30,
      minimum: 0,
      maximum: 30,
    },
    [TaskSettingId.QuickOpenDetail]: {
      markdownDescription: nls.localize(
        "task.quickOpen.detail",
        "Controls whether to show the task detail for tasks that have a detail in task quick picks, such as Run Task.",
      ),
      type: "boolean",
      default: true,
    },
    [TaskSettingId.QuickOpenSkip]: {
      type: "boolean",
      description: nls.localize(
        "task.quickOpen.skip",
        "Controls whether the task quick pick is skipped when there is only one task to pick from.",
      ),
      default: false,
    },
    [TaskSettingId.QuickOpenShowAll]: {
      type: "boolean",
      description: nls.localize(
        "task.quickOpen.showAll",
        'Causes the Tasks: Run Task command to use the slower "show all" behavior instead of the faster two level picker where tasks are grouped by provider.',
      ),
      default: false,
    },
    [TaskSettingId.AllowAutomaticTasks]: {
      type: "string",
      enum: ["on", "off"],
      enumDescriptions: [
        nls.localize("task.allowAutomaticTasks.on", "Always"),
        nls.localize("task.allowAutomaticTasks.off", "Never"),
      ],
      description: nls.localize(
        "task.allowAutomaticTasks",
        "Enable automatic tasks - note that tasks won't run in an untrusted workspace.",
      ),
      default: "on",
      restricted: true,
    },
    [TaskSettingId.Reconnection]: {
      type: "boolean",
      description: nls.localize(
        "task.reconnection",
        "On window reload, reconnect to tasks that have problem matchers.",
      ),
      default: true,
    },
    [TaskSettingId.SaveBeforeRun]: {
      markdownDescription: nls.localize(
        "task.saveBeforeRun",
        "Save all dirty editors before running a task.",
      ),
      type: "string",
      enum: ["always", "never", "prompt"],
      enumDescriptions: [
        nls.localize(
          "task.saveBeforeRun.always",
          "Always saves all editors before running.",
        ),
        nls.localize(
          "task.saveBeforeRun.never",
          "Never saves editors before running.",
        ),
        nls.localize(
          "task.SaveBeforeRun.prompt",
          "Prompts whether to save editors before running.",
        ),
      ],
      default: "always",
    },
    [TaskSettingId.VerboseLogging]: {
      type: "boolean",
      description: nls.localize(
        "task.verboseLogging",
        "Enable verbose logging for tasks.",
      ),
      default: false,
    },
  },
})
