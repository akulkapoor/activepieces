import { FlowActionType, StepOutputStatus } from '@activepieces/shared'
import { describe, expect, it } from 'vitest'
import { engineSensitivityHelper } from '../../src/lib/helper/engine-sensitivity-helper'

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
