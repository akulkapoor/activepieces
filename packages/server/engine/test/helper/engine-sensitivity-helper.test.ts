import {
    FlowActionType,
    FlowTriggerType,
    FlowVersion,
    FlowVersionState,
    GenericStepOutput,
    StepOutputStatus,
} from '@activepieces/shared'
import { describe, expect, it } from 'vitest'
import { FlowExecutorContext } from '../../src/lib/handler/context/flow-execution-context'
import { engineSensitivityHelper } from '../../src/lib/helper/engine-sensitivity-helper'

function makeFlowVersionWithTriggerOnly(): FlowVersion {
    return {
        id: 'fv-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
        flowId: 'flow-1',
        displayName: 'Test Flow',
        trigger: {
            name: 'trigger_1',
            valid: true,
            displayName: 'Test Trigger',
            type: FlowTriggerType.EMPTY,
            settings: {},
        },
        updatedBy: null,
        valid: true,
        schemaVersion: null,
        agentIds: [],
        state: FlowVersionState.DRAFT,
        connectionIds: [],
        backupFiles: null,
        notes: [],
    }
}

describe('engineSensitivityHelper.collectRestoredStepNames', () => {
    it('collects step names from nested loop iterations recursively', () => {
        const names = engineSensitivityHelper.collectRestoredStepNames({
            steps: {
                outer_loop: {
                    type: FlowActionType.LOOP_ON_ITEMS,
                    status: StepOutputStatus.SUCCEEDED,
                    input: {},
                    output: {
                        item: 'x',
                        index: 0,
                        iterations: [
                            {
                                inner_loop: {
                                    type: FlowActionType.LOOP_ON_ITEMS,
                                    status: StepOutputStatus.SUCCEEDED,
                                    input: {},
                                    output: {
                                        item: 'y',
                                        index: 0,
                                        iterations: [
                                            {
                                                deep_step: {
                                                    type: FlowActionType.CODE,
                                                    status: StepOutputStatus.SUCCEEDED,
                                                    input: {},
                                                    output: {},
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        })

        expect(names).toEqual(new Set(['outer_loop', 'inner_loop', 'deep_step']))
    })
})

describe('engineSensitivityHelper.restoreSensitivityManifestsForResume', () => {
    it('restores persisted manifests for steps removed from the flow version', async () => {
        let flowContext = FlowExecutorContext.empty()
        flowContext = await flowContext.upsertStep('orphan_step', GenericStepOutput.create({
            type: FlowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: { apiKey: 'secret' },
            output: { token: 'secret-token' },
        }))

        const restored = await engineSensitivityHelper.restoreSensitivityManifestsForResume({
            flowContext,
            flowVersion: makeFlowVersionWithTriggerOnly(),
            devPieces: [],
            persistedManifests: {
                orphan_step: {
                    input: ['apiKey'],
                    output: ['token'],
                },
            },
        })

        expect(restored.getStepSensitivityManifest('orphan_step')).toEqual({
            input: ['apiKey'],
            output: ['token'],
        })
    })

    it('prefers persisted manifests over rebuilding from the current flow version', async () => {
        let flowContext = FlowExecutorContext.empty()
        flowContext = await flowContext.upsertStep('step_1', GenericStepOutput.create({
            type: FlowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: {},
            output: { token: 'secret-token' },
        }))

        const restored = await engineSensitivityHelper.restoreSensitivityManifestsForResume({
            flowContext,
            flowVersion: {
                ...makeFlowVersionWithTriggerOnly(),
                trigger: {
                    name: 'trigger_1',
                    valid: true,
                    displayName: 'Test Trigger',
                    type: FlowTriggerType.EMPTY,
                    settings: {},
                    nextAction: {
                        name: 'step_1',
                        valid: true,
                        displayName: 'Step 1',
                        type: FlowActionType.CODE,
                        settings: {
                            sourceCode: { code: 'return {}', packageJson: '{}' },
                            input: {},
                            sensitiveFields: {
                                output: ['name'],
                            },
                        },
                    },
                },
            },
            devPieces: [],
            persistedManifests: {
                step_1: {
                    input: ['auth'],
                    output: ['token', 'body.access_token'],
                },
            },
        })

        expect(restored.getStepSensitivityManifest('step_1')).toEqual({
            input: ['auth'],
            output: ['token', 'body.access_token'],
        })
    })
})
