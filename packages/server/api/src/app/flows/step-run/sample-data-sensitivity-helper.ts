import { pieceSensitivityUtils } from '@activepieces/pieces-framework'
import {
    EMPTY_SENSITIVITY_MANIFEST,
    FlowAction,
    FlowActionType,
    FlowTriggerType,
    isNil,
    SensitivityManifest,
    sensitivityUtils,
    Step,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { pieceMetadataService } from '../../pieces/metadata/piece-metadata-service'

async function buildManifestForStep({
    step,
    platformId,
    log,
}: BuildManifestForStepParams): Promise<SensitivityManifest> {
    switch (step.type) {
        case FlowActionType.PIECE: {
            const pieceAction = step
            if (isNil(pieceAction.settings.actionName)) {
                return sensitivityUtils.buildSensitivityManifest({
                    sensitiveFields: pieceAction.settings.sensitiveFields,
                })
            }
            const piece = await pieceMetadataService(log).getOrThrow({
                name: pieceAction.settings.pieceName,
                version: pieceAction.settings.pieceVersion,
                platformId,
            })
            const action = piece.actions[pieceAction.settings.actionName]
            if (isNil(action)) {
                return sensitivityUtils.buildSensitivityManifest({
                    sensitiveFields: pieceAction.settings.sensitiveFields,
                })
            }
            return pieceSensitivityUtils.buildManifestFromComponent({
                sensitiveFields: pieceAction.settings.sensitiveFields,
                props: action.props,
                outputSchema: action.outputSchema,
                requireAuth: action.requireAuth,
            })
        }
        case FlowActionType.CODE:
        case FlowActionType.ROUTER:
        case FlowActionType.LOOP_ON_ITEMS:
            return sensitivityUtils.buildSensitivityManifest({
                sensitiveFields: (step as FlowAction).settings.sensitiveFields,
            })
        case FlowTriggerType.PIECE: {
            const pieceTrigger = step
            if (isNil(pieceTrigger.settings.triggerName)) {
                return sensitivityUtils.buildSensitivityManifest({
                    sensitiveFields: pieceTrigger.settings.sensitiveFields,
                })
            }
            const piece = await pieceMetadataService(log).getOrThrow({
                name: pieceTrigger.settings.pieceName,
                version: pieceTrigger.settings.pieceVersion,
                platformId,
            })
            const trigger = piece.triggers[pieceTrigger.settings.triggerName]
            if (isNil(trigger)) {
                return sensitivityUtils.buildSensitivityManifest({
                    sensitiveFields: pieceTrigger.settings.sensitiveFields,
                })
            }
            return pieceSensitivityUtils.buildManifestFromComponent({
                sensitiveFields: pieceTrigger.settings.sensitiveFields,
                props: trigger.props,
                outputSchema: trigger.outputSchema,
                requireAuth: resolveTriggerRequireAuth({ trigger, pieceHasAuth: !isNil(piece.auth) }),
            })
        }
        default:
            return EMPTY_SENSITIVITY_MANIFEST
    }
}

function resolveTriggerRequireAuth({
    trigger,
    pieceHasAuth,
}: ResolveTriggerRequireAuthParams): boolean {
    if ('requireAuth' in trigger && typeof trigger.requireAuth === 'boolean') {
        return trigger.requireAuth
    }
    return pieceHasAuth
}

export const sampleDataSensitivityHelper = {
    buildManifestForStep,
}

type BuildManifestForStepParams = {
    step: Step
    platformId: string
    log: FastifyBaseLogger
}

type ResolveTriggerRequireAuthParams = {
    trigger: { requireAuth?: boolean }
    pieceHasAuth: boolean
}
