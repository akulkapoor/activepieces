import { pieceSensitivityUtils } from '@activepieces/pieces-framework'
import {
    BaseStepOutput,
    EMPTY_SENSITIVITY_MANIFEST,
    FlowAction,
    FlowActionType,
    FlowTrigger,
    FlowTriggerType,
    isNil,
    SensitivityManifest,
    sensitivityUtils,
    tryParseFriendlyPieceError,
} from '@activepieces/shared'
import { pieceLoader } from './piece-loader'

function applySensitivityRedaction<T extends BaseStepOutput>({
    stepOutput,
    manifest,
}: ApplySensitivityRedactionParams<T>): T {
    if (manifest.input.length === 0 && manifest.output.length === 0) {
        return stepOutput
    }
    const redacted = sensitivityUtils.redactStepOutput({
        stepOutput: {
            input: stepOutput.input,
            output: stepOutput.output,
            ...(!isNil(stepOutput.errorMessage) ? { errorMessage: stepOutput.errorMessage } : {}),
        },
        manifest,
    })
    return Object.assign(
        Object.create(Object.getPrototypeOf(stepOutput)),
        stepOutput,
        {
            input: redacted.input,
            output: redacted.output,
            ...(!isNil(redacted.errorMessage) ? { errorMessage: redacted.errorMessage } : {}),
        },
    )
}

function redactPersistedErrorMessage({
    message,
    manifest,
}: RedactPersistedErrorMessageParams): string {
    if (manifest.input.length === 0 && manifest.output.length === 0) {
        return message
    }
    const parsed = tryParseFriendlyPieceError(message)
    if (isNil(parsed)) {
        return message
    }
    const paths = [...new Set([...manifest.input, ...manifest.output])]
    return JSON.stringify(sensitivityUtils.redactFriendlyPieceError({
        error: parsed,
        paths,
    }))
}

async function buildManifestForAction({
    action,
    devPieces,
}: BuildManifestForActionParams): Promise<SensitivityManifest> {
    switch (action.type) {
        case FlowActionType.PIECE: {
            const pieceAction = action
            if (isNil(pieceAction.settings.actionName)) {
                return sensitivityUtils.buildSensitivityManifest({
                    sensitiveFields: pieceAction.settings.sensitiveFields,
                })
            }
            const { pieceAction: pieceStep } = await pieceLoader.getPieceAndActionOrThrow({
                pieceName: pieceAction.settings.pieceName,
                pieceVersion: pieceAction.settings.pieceVersion,
                actionName: pieceAction.settings.actionName,
                devPieces,
            })
            return sensitivityUtils.buildSensitivityManifest({
                sensitiveFields: pieceAction.settings.sensitiveFields,
                inputProperties: pieceSensitivityUtils.piecePropertyMapToSnapshots(pieceStep.props),
                outputSchemaFields: pieceSensitivityUtils.outputSchemaToFieldSnapshots(pieceStep.outputSchema),
                includeAuthField: pieceStep.requireAuth,
            })
        }
        case FlowActionType.CODE:
        case FlowActionType.ROUTER:
        case FlowActionType.LOOP_ON_ITEMS:
            return sensitivityUtils.buildSensitivityManifest({
                sensitiveFields: action.settings.sensitiveFields,
            })
        default:
            return EMPTY_SENSITIVITY_MANIFEST
    }
}

async function buildManifestForTrigger({
    trigger,
    devPieces,
}: BuildManifestForTriggerParams): Promise<SensitivityManifest> {
    if (trigger.type !== FlowTriggerType.PIECE) {
        return EMPTY_SENSITIVITY_MANIFEST
    }
    const pieceTrigger = trigger
    if (isNil(pieceTrigger.settings.triggerName)) {
        return sensitivityUtils.buildSensitivityManifest({
            sensitiveFields: pieceTrigger.settings.sensitiveFields,
        })
    }
    const { pieceTrigger: pieceStep } = await pieceLoader.getPieceAndTriggerOrThrow({
        pieceName: pieceTrigger.settings.pieceName,
        pieceVersion: pieceTrigger.settings.pieceVersion,
        triggerName: pieceTrigger.settings.triggerName,
        devPieces,
    })
    return sensitivityUtils.buildSensitivityManifest({
        sensitiveFields: pieceTrigger.settings.sensitiveFields,
        inputProperties: pieceSensitivityUtils.piecePropertyMapToSnapshots(pieceStep.props),
        outputSchemaFields: pieceSensitivityUtils.outputSchemaToFieldSnapshots(pieceStep.outputSchema),
        includeAuthField: pieceStep.requireAuth,
    })
}

export const engineSensitivityHelper = {
    applySensitivityRedaction,
    buildManifestForAction,
    buildManifestForTrigger,
    redactPersistedErrorMessage,
}

type ApplySensitivityRedactionParams<T extends BaseStepOutput> = {
    stepOutput: T
    manifest: SensitivityManifest
}

type RedactPersistedErrorMessageParams = {
    message: string
    manifest: SensitivityManifest
}

type BuildManifestForActionParams = {
    action: FlowAction
    devPieces: string[]
}

type BuildManifestForTriggerParams = {
    trigger: FlowTrigger
    devPieces: string[]
}
