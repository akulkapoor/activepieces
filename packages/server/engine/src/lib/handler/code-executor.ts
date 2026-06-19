import path from 'path'
import { LATEST_CONTEXT_VERSION } from '@activepieces/pieces-framework'
import { CodeAction, EngineGenericError, FlowActionType, FlowRunStatus, GenericStepOutput, isNil, StepOutputStatus } from '@activepieces/shared'
import { initCodeSandbox } from '../core/code/code-sandbox'
import { continueIfFailureHandler, runWithExponentialBackoff } from '../helper/error-handling'
import { flowRunProgressReporter } from '../helper/flow-run-progress-reporter'
import { engineSensitivityHelper } from '../helper/engine-sensitivity-helper'
import { utils } from '../utils'
import { ActionHandler, BaseExecutor } from './base-executor'

export const codeExecutor: BaseExecutor<CodeAction> = {
    async handle({
        action,
        executionState,
        constants,
    }) {
        if (executionState.isCompleted({ stepName: action.name })) {
            return executionState
        }
        const resultExecution = await runWithExponentialBackoff(executionState, action, constants, executeAction)
        return continueIfFailureHandler(resultExecution, action, constants)
    },
}

const executeAction: ActionHandler<CodeAction> = async ({ action, executionState, constants }) => {
    const stepStartTime = performance.now()
    const stepOutput = GenericStepOutput.create({
        input: {},
        type: FlowActionType.CODE,
        status: StepOutputStatus.RUNNING,
    })

    const { data: executionStateResult, error: executionStateError } = await utils.tryCatchAndThrowOnEngineError((async () => {
        const sensitivityManifest = await engineSensitivityHelper.buildManifestForAction({
            action,
            devPieces: constants.devPieces,
        })
        executionState = executionState.withStepSensitivityManifest(action.name, sensitivityManifest)

        const { censoredInput, resolvedInput } = await constants.getPropsResolver(LATEST_CONTEXT_VERSION).resolve<Record<string, unknown>>({
            unresolvedInput: action.settings.input,
            executionState,
        })
        stepOutput.input = censoredInput

        await flowRunProgressReporter.sendUpdate({
            engineConstants: constants,
            flowExecutorContext: await executionState.upsertStep(action.name, stepOutput),
            stepNameToUpdate: action.name,
        })

        if (isNil(constants.runEnvironment)) {
            throw new EngineGenericError('RunEnvironmentNotSetError', 'Run environment is not set')
        }

        const artifactPath = path.resolve(`${constants.baseCodeDirectory}/${constants.flowVersionId}/${action.name}/index.js`)
        const codeSandbox = await initCodeSandbox()

        const output = await codeSandbox.runCodeModule({
            codeFilePath: artifactPath,
            inputs: resolvedInput,
        })

        const succeeded = stepOutput.setOutput(output).setStatus(StepOutputStatus.SUCCEEDED).setDuration(performance.now() - stepStartTime)
        return (await executionState.upsertStep(action.name, succeeded)).incrementStepsExecuted()
    }))

    if (executionStateError) {
        const sensitivityManifest = executionState.getStepSensitivityManifest(action.name)
        const errorMessage = engineSensitivityHelper.redactPersistedErrorMessage({
            message: utils.formatError(executionStateError),
            manifest: sensitivityManifest,
        })
        const failedStepOutput = stepOutput
            .setStatus(StepOutputStatus.FAILED)
            .setErrorMessage(errorMessage)
            .setDuration(performance.now() - stepStartTime)

        return (await executionState
            .upsertStep(action.name, failedStepOutput))
            .setVerdict({ status: FlowRunStatus.FAILED, failedStep: {
                name: action.name,
                displayName: action.displayName,
                message: errorMessage,
            } })
    }

    return executionStateResult
}
