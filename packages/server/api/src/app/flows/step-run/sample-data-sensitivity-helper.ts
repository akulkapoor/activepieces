import { pieceSensitivityUtils } from '@activepieces/pieces-framework'
import {
    FlowActionType,
    FlowTriggerType,
    isNil,
    SensitivityManifest,
    Step,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { pieceMetadataService } from '../../pieces/metadata/piece-metadata-service'

async function resolvePieceComponent({
    step,
    platformId,
    log,
}: ResolvePieceComponentParams) {
    switch (step.type) {
        case FlowActionType.PIECE: {
            if (isNil(step.settings.actionName)) {
                return null
            }
            const piece = await pieceMetadataService(log).getOrThrow({
                name: step.settings.pieceName,
                version: step.settings.pieceVersion,
                platformId,
            })
            const action = piece.actions[step.settings.actionName]
            if (isNil(action)) {
                return null
            }
            return {
                props: action.props,
                outputSchema: action.outputSchema,
                requireAuth: pieceSensitivityUtils.resolvePieceComponentRequireAuth({
                    requireAuth: action.requireAuth,
                    pieceHasAuth: pieceSensitivityUtils.pieceHasAuth(piece.auth),
                }),
            }
        }
        case FlowTriggerType.PIECE: {
            if (isNil(step.settings.triggerName)) {
                return null
            }
            const piece = await pieceMetadataService(log).getOrThrow({
                name: step.settings.pieceName,
                version: step.settings.pieceVersion,
                platformId,
            })
            const trigger = piece.triggers[step.settings.triggerName]
            if (isNil(trigger)) {
                return null
            }
            return {
                props: trigger.props,
                outputSchema: trigger.outputSchema,
                requireAuth: pieceSensitivityUtils.resolvePieceComponentRequireAuth({
                    requireAuth: trigger.requireAuth,
                    pieceHasAuth: pieceSensitivityUtils.pieceHasAuth(piece.auth),
                }),
            }
        }
        default:
            return null
    }
}

async function buildManifestForStep({
    step,
    platformId,
    log,
}: BuildManifestForStepParams): Promise<SensitivityManifest> {
    const pieceComponent = await resolvePieceComponent({ step, platformId, log })
    return pieceSensitivityUtils.buildManifestFromStep({ step, pieceComponent })
}

export const sampleDataSensitivityHelper = {
    buildManifestForStep,
}

type BuildManifestForStepParams = {
    step: Step
    platformId: string
    log: FastifyBaseLogger
}

type ResolvePieceComponentParams = {
    step: Step
    platformId: string
    log: FastifyBaseLogger
}
