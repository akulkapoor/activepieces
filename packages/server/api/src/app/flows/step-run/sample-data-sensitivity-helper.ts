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
            return sensitivityUtils.buildSensitivityManifest({
                sensitiveFields: pieceAction.settings.sensitiveFields,
                inputProperties: pieceSensitivityUtils.piecePropertyMapToSnapshots(action.props),
                outputSchemaFields: pieceSensitivityUtils.outputSchemaToFieldSnapshots(action.outputSchema),
                includeAuthField: action.requireAuth,
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
            return sensitivityUtils.buildSensitivityManifest({
                sensitiveFields: pieceTrigger.settings.sensitiveFields,
                inputProperties: pieceSensitivityUtils.piecePropertyMapToSnapshots(trigger.props),
                outputSchemaFields: pieceSensitivityUtils.outputSchemaToFieldSnapshots(trigger.outputSchema),
                includeAuthField: false,
            })
        }
        default:
            return EMPTY_SENSITIVITY_MANIFEST
    }
}

function redactSampleDataPayload({
    payload,
    manifest,
    type,
}: RedactSampleDataPayloadParams): unknown {
    if (manifest.input.length === 0 && manifest.output.length === 0) {
        return payload
    }
    const paths = type === 'input' ? manifest.input : manifest.output
    if (paths.length === 0) {
        return payload
    }
    return sensitivityUtils.redactValue({ value: payload, paths })
}

export const sampleDataSensitivityHelper = {
    buildManifestForStep,
    redactSampleDataPayload,
}

type BuildManifestForStepParams = {
    step: Step
    platformId: string
    log: FastifyBaseLogger
}

type RedactSampleDataPayloadParams = {
    payload: unknown
    manifest: SensitivityManifest
    type: 'input' | 'output'
}
