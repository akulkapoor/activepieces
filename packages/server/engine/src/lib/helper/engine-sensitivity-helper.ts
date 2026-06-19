import { pieceSensitivityUtils } from '@activepieces/pieces-framework'
import {
    EMPTY_SENSITIVITY_MANIFEST,
    FlowAction,
    FlowActionType,
    FlowTrigger,
    FlowTriggerType,
    isNil,
    SensitivityManifest,
    sensitivityUtils,
} from '@activepieces/shared'
import { pieceLoader } from './piece-loader'

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
            return pieceSensitivityUtils.buildManifestFromComponent({
                sensitiveFields: pieceAction.settings.sensitiveFields,
                props: pieceStep.props,
                outputSchema: pieceStep.outputSchema,
                requireAuth: pieceStep.requireAuth,
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
    return pieceSensitivityUtils.buildManifestFromComponent({
        sensitiveFields: pieceTrigger.settings.sensitiveFields,
        props: pieceStep.props,
        outputSchema: pieceStep.outputSchema,
        requireAuth: pieceStep.requireAuth,
    })
}

export const engineSensitivityHelper = {
    buildManifestForAction,
    buildManifestForTrigger,
}

type BuildManifestForActionParams = {
    action: FlowAction
    devPieces: string[]
}

type BuildManifestForTriggerParams = {
    trigger: FlowTrigger
    devPieces: string[]
}
