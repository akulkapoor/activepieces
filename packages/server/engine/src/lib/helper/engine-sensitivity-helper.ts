import { pieceSensitivityUtils } from '@activepieces/pieces-framework'
import {
    FlowActionType,
    FlowTriggerType,
    isNil,
    SensitivityManifest,
    Step,
    StepOutput,
    tryCatch,
} from '@activepieces/shared'
import { pieceLoader } from './piece-loader'

async function resolvePieceComponent({
    step,
    devPieces,
}: ResolvePieceComponentParams) {
    switch (step.type) {
        case FlowActionType.PIECE: {
            if (isNil(step.settings.actionName)) {
                return null
            }
            const { piece, pieceAction } = await pieceLoader.getPieceAndActionOrThrow({
                pieceName: step.settings.pieceName,
                pieceVersion: step.settings.pieceVersion,
                actionName: step.settings.actionName,
                devPieces,
            })
            return {
                props: pieceAction.props,
                outputSchema: pieceAction.outputSchema,
                requireAuth: pieceSensitivityUtils.resolvePieceComponentRequireAuth({
                    requireAuth: pieceAction.requireAuth,
                    pieceHasAuth: pieceSensitivityUtils.pieceHasAuth(piece.auth),
                }),
            }
        }
        case FlowTriggerType.PIECE: {
            if (isNil(step.settings.triggerName)) {
                return null
            }
            const { piece, pieceTrigger } = await pieceLoader.getPieceAndTriggerOrThrow({
                pieceName: step.settings.pieceName,
                pieceVersion: step.settings.pieceVersion,
                triggerName: step.settings.triggerName,
                devPieces,
            })
            return {
                props: pieceTrigger.props,
                outputSchema: pieceTrigger.outputSchema,
                requireAuth: pieceSensitivityUtils.resolvePieceComponentRequireAuth({
                    requireAuth: pieceTrigger.requireAuth,
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
    devPieces,
}: BuildManifestForStepParams): Promise<SensitivityManifest> {
    const pieceComponent = await resolvePieceComponent({ step, devPieces })
    return pieceSensitivityUtils.buildManifestFromStep({ step, pieceComponent })
}

async function buildManifestForRestoredStep({
    step,
    devPieces,
}: BuildManifestForStepParams): Promise<SensitivityManifest> {
    const { data: pieceComponent } = await tryCatch(() => resolvePieceComponent({ step, devPieces }))
    return pieceSensitivityUtils.buildManifestFromStep({
        step,
        pieceComponent: pieceComponent ?? null,
    })
}

function collectRestoredStepNames({ steps }: CollectRestoredStepNamesParams): Set<string> {
    const names = new Set<string>()
    collectStepNamesFromStepMap({ steps, names })
    return names
}

function collectStepNamesFromStepMap({
    steps,
    names,
}: CollectStepNamesFromStepMapParams): void {
    for (const [stepName, output] of Object.entries(steps)) {
        names.add(stepName)
        if (output.type !== FlowActionType.LOOP_ON_ITEMS || isNil(output.output)) {
            continue
        }
        const loopOutput = output.output
        for (const iteration of loopOutput.iterations ?? []) {
            collectStepNamesFromStepMap({ steps: iteration, names })
        }
    }
}

export const engineSensitivityHelper = {
    buildManifestForStep,
    buildManifestForRestoredStep,
    collectRestoredStepNames,
}

type BuildManifestForStepParams = {
    step: Step
    devPieces: string[]
}

type ResolvePieceComponentParams = {
    step: Step
    devPieces: string[]
}

type CollectRestoredStepNamesParams = {
    steps: Readonly<Record<string, StepOutput>>
}

type CollectStepNamesFromStepMapParams = {
    steps: Readonly<Record<string, StepOutput>>
    names: Set<string>
}
