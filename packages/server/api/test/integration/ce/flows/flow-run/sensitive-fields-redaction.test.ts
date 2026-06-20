import {
    FileCompression,
    FileType,
    FlowActionType,
    FlowRunStatus,
    FlowTriggerType,
    FlowVersionState,
    RunEnvironment,
    SENSITIVE_VALUE_PLACEHOLDER,
    SampleDataFileType,
    StepOutputStatus,
} from '@activepieces/shared'
import { FastifyInstance } from 'fastify'
import { fileService } from '../../../../../src/app/file/file.service'
import { saveSampleData } from '../../../../../src/app/flows/step-run/sample-data.service'
import { createTestContext, TestContext } from '../../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../helpers/test-setup'
import { createMockFlow, createMockFlowRun, createMockFlowVersion } from '../../../../helpers/mocks'
import { db } from '../../../../helpers/db'

let app: FastifyInstance
let ctx: TestContext

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    ctx = await createTestContext(app)
})

const codeStep = {
    type: FlowActionType.CODE as const,
    name: 'step_1',
    displayName: 'Code',
    valid: true,
    settings: {
        sourceCode: {
            code: 'export const code = async () => ({ secretOutput: "my-secret", name: "visible" });',
            packageJson: '{}',
        },
        input: {},
        sensitiveFields: {
            output: ['secretOutput'],
        },
        errorHandlingOptions: {},
    },
}

describe('Sensitive fields API redaction', () => {
    it('should redact sensitive step output when reading a flow run via GET', async () => {
        const projectId = ctx.project.id
        const platformId = ctx.platform.id

        const flow = createMockFlow({ projectId })
        await db.save('flow', flow)

        const flowVersion = createMockFlowVersion({
            flowId: flow.id,
            state: FlowVersionState.LOCKED,
            trigger: {
                type: FlowTriggerType.EMPTY,
                name: 'trigger',
                settings: {},
                valid: true,
                displayName: 'Trigger',
                lastUpdatedDate: new Date().toISOString(),
                nextAction: codeStep,
            },
        })
        await db.save('flow_version', flowVersion)

        const logContent = {
            executionState: {
                steps: {
                    trigger: {
                        type: FlowTriggerType.EMPTY,
                        status: StepOutputStatus.SUCCEEDED,
                        input: {},
                        output: {},
                    },
                    step_1: {
                        type: FlowActionType.CODE,
                        status: StepOutputStatus.SUCCEEDED,
                        input: {},
                        output: {
                            secretOutput: 'my-secret',
                            name: 'visible',
                        },
                    },
                },
                tags: [],
            },
        }
        const logData = Buffer.from(JSON.stringify(logContent), 'utf-8')
        const logFile = await fileService(app.log).save({
            projectId,
            platformId,
            type: FileType.FLOW_RUN_LOG,
            data: logData,
            size: logData.length,
            compression: FileCompression.NONE,
        })

        const flowRun = createMockFlowRun({
            projectId,
            flowId: flow.id,
            flowVersionId: flowVersion.id,
            status: FlowRunStatus.SUCCEEDED,
            environment: RunEnvironment.TESTING,
            logsFileId: logFile.id,
        })
        await db.save('flow_run', flowRun)

        const response = await ctx.get(`/v1/flow-runs/${flowRun.id}`)

        expect(response.statusCode).toBe(200)
        const body = response.json()
        expect(body.steps.step_1.output.secretOutput).toBe(SENSITIVE_VALUE_PLACEHOLDER)
        expect(body.steps.step_1.output.name).toBe('visible')
    })

    it('should redact sensitive fields when saving and reading sample data', async () => {
        const projectId = ctx.project.id

        const flow = createMockFlow({ projectId })
        await db.save('flow', flow)

        const flowVersion = createMockFlowVersion({
            flowId: flow.id,
            state: FlowVersionState.LOCKED,
            trigger: {
                type: FlowTriggerType.EMPTY,
                name: 'trigger',
                settings: {},
                valid: true,
                displayName: 'Trigger',
                lastUpdatedDate: new Date().toISOString(),
                nextAction: codeStep,
            },
        })
        await db.save('flow_version', flowVersion)

        const savedFile = await saveSampleData({
            projectId,
            flowVersionId: flowVersion.id,
            stepName: 'step_1',
            payload: {
                secretOutput: 'my-secret',
                name: 'visible',
            },
            type: SampleDataFileType.OUTPUT,
        }, app.log)

        const stored = await fileService(app.log).getDataOrUndefined({
            projectId,
            fileId: savedFile.id,
            type: FileType.SAMPLE_DATA,
        })
        expect(stored).toBeDefined()
        const storedPayload = JSON.parse(stored!.data.toString('utf-8'))
        expect(storedPayload.secretOutput).toBe(SENSITIVE_VALUE_PLACEHOLDER)
        expect(storedPayload.name).toBe('visible')

        const stepWithSampleData = {
            ...codeStep,
            settings: {
                ...codeStep.settings,
                sampleData: {
                    sampleDataFileId: savedFile.id,
                },
            },
        }
        await db.update('flow_version', flowVersion.id, {
            trigger: {
                type: FlowTriggerType.EMPTY,
                name: 'trigger',
                settings: {},
                valid: true,
                displayName: 'Trigger',
                lastUpdatedDate: new Date().toISOString(),
                nextAction: stepWithSampleData,
            },
        })

        const response = await ctx.get('/v1/sample-data', {
            flowId: flow.id,
            flowVersionId: flowVersion.id,
            stepName: 'step_1',
            type: SampleDataFileType.OUTPUT,
            projectId,
        })

        expect(response.statusCode).toBe(200)
        expect(response.json().secretOutput).toBe(SENSITIVE_VALUE_PLACEHOLDER)
        expect(response.json().name).toBe('visible')
    })
})
