import { describe, expect, it } from 'vitest'

import {
    FlowActionType,
    GenericStepOutput,
    SENSITIVE_VALUE_PLACEHOLDER,
    StepOutputStatus,
} from '@activepieces/shared'
import { FlowExecutorContext } from '../../../src/lib/handler/context/flow-execution-context'

describe('FlowExecutorContext.upsertStep sensitivity', () => {
    it('keeps sensitive values in the execution journal for downstream resolution', async () => {
        const context = new FlowExecutorContext().withStepSensitivityManifest('step_1', {
            input: ['apiKey'],
            output: ['access_token'],
        })

        const stepOutput = GenericStepOutput.create({
            type: FlowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: { apiKey: 'secret-key', title: 'hello' },
            output: { access_token: 'token-value', name: 'Acme' },
        })

        const next = await context.upsertStep('step_1', stepOutput)
        const stored = next.getStepOutput('step_1')

        expect(stored?.input).toEqual({
            apiKey: 'secret-key',
            title: 'hello',
        })
        expect(stored?.output).toEqual({
            access_token: 'token-value',
            name: 'Acme',
        })
    })

    it('exposes unredacted outputs via currentState for later steps', async () => {
        const context = new FlowExecutorContext().withStepSensitivityManifest('step_1', {
            output: ['access_token'],
        })

        const stepOutput = GenericStepOutput.create({
            type: FlowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: {},
            output: { access_token: 'token-value', name: 'Acme' },
        })

        const next = await context.upsertStep('step_1', stepOutput)
        const state = await next.currentState(['step_1'])

        expect(state['step_1']).toEqual({
            output: {
                access_token: 'token-value',
                name: 'Acme',
            },
            error: undefined,
        })
    })
})

describe('FlowExecutorContext display redaction', () => {
    it('redacts sensitive fields for display-only surfaces', async () => {
        const context = new FlowExecutorContext().withStepSensitivityManifest('step_1', {
            input: ['apiKey'],
            output: ['access_token'],
        })

        const stepOutput = GenericStepOutput.create({
            type: FlowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: { apiKey: 'secret-key', title: 'hello' },
            output: { access_token: 'token-value', name: 'Acme' },
        })

        const next = await context.upsertStep('step_1', stepOutput)
        const persisted = next.getRedactedStepsForPersistence()

        expect(persisted['step_1']?.input).toEqual({
            apiKey: SENSITIVE_VALUE_PLACEHOLDER,
            title: 'hello',
        })
        expect(persisted['step_1']?.output).toEqual({
            access_token: SENSITIVE_VALUE_PLACEHOLDER,
            name: 'Acme',
        })
    })
})
