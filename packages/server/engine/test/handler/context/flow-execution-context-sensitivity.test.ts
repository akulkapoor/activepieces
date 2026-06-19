import { describe, expect, it } from 'vitest'

import {
    FlowActionType,
    GenericStepOutput,
    SENSITIVE_VALUE_PLACEHOLDER,
    StepOutputStatus,
} from '@activepieces/shared'
import { FlowExecutorContext } from '../../../src/lib/handler/context/flow-execution-context'

describe('FlowExecutorContext.upsertStep sensitivity redaction', () => {
    it('redacts sensitive fields before persisting step output', async () => {
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
            apiKey: SENSITIVE_VALUE_PLACEHOLDER,
            title: 'hello',
        })
        expect(stored?.output).toEqual({
            access_token: SENSITIVE_VALUE_PLACEHOLDER,
            name: 'Acme',
        })
    })
})
