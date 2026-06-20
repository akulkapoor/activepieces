import { pieceSensitivityUtils } from '@activepieces/pieces-framework'
import {
    ExecutionState,
    FlowActionType,
    flowStructureUtil,
    FlowTriggerType,
    FlowVersion,
    isNil,
    PlatformId,
    SensitivityManifest,
    sensitivityUtils,
    Step,
    StepOutput,
    tryCatch,
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
            const { data: piece } = await tryCatch(() => pieceMetadataService(log).getOrThrow({
                platformId,
                name: step.settings.pieceName,
                version: step.settings.pieceVersion,
            }))
            if (isNil(piece)) {
                return null
            }
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
            const { data: piece } = await tryCatch(() => pieceMetadataService(log).getOrThrow({
                platformId,
                name: step.settings.pieceName,
                version: step.settings.pieceVersion,
            }))
            if (isNil(piece)) {
                return null
            }
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

function collectStepNamesFromExecutionSteps(steps: Readonly<Record<string, StepOutput>>): Set<string> {
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

async function resolveManifestsForExecutionState({
    executionState,
    flowVersion,
    platformId,
    log,
}: ResolveManifestsForExecutionStateParams): Promise<Record<string, SensitivityManifest>> {
    const persistedManifests = executionState.stepSensitivityManifests ?? {}
    const resolvedManifests: Record<string, SensitivityManifest> = { ...persistedManifests }
    const executedStepNames = collectStepNamesFromExecutionSteps(executionState.steps)
    const candidateSteps = [flowVersion.trigger, ...flowStructureUtil.getAllSteps(flowVersion.trigger)]

    for (const step of candidateSteps) {
        if (!executedStepNames.has(step.name)) {
            continue
        }
        if (!isNil(resolvedManifests[step.name])) {
            continue
        }
        resolvedManifests[step.name] = await buildManifestForStep({
            step,
            platformId,
            log,
        })
    }

    return resolvedManifests
}

function redactExecutionStepsForDisplay({
    executionState,
    stepSensitivityManifests,
}: RedactExecutionStepsForDisplayParams): Record<string, StepOutput> {
    return sensitivityUtils.redactExecutionSteps({
        steps: executionState.steps,
        stepSensitivityManifests,
    })
}

export const apiSensitivityHelper = {
    buildManifestForStep,
    redactExecutionStepsForDisplay,
    resolveManifestsForExecutionState,
}

type BuildManifestForStepParams = {
    step: Step
    platformId: PlatformId
    log: FastifyBaseLogger
}

type ResolvePieceComponentParams = {
    step: Step
    platformId: PlatformId
    log: FastifyBaseLogger
}

type CollectStepNamesFromStepMapParams = {
    steps: Readonly<Record<string, StepOutput>>
    names: Set<string>
}

type ResolveManifestsForExecutionStateParams = {
    executionState: ExecutionState
    flowVersion: FlowVersion
    platformId: PlatformId
    log: FastifyBaseLogger
}

type RedactExecutionStepsForDisplayParams = {
    executionState: ExecutionState
    stepSensitivityManifests: Readonly<Record<string, SensitivityManifest>>
}
