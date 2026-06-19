import { z } from 'zod'
import { TriggerPayload } from '../../engine'
import { SensitivityManifest } from '../../sensitivity/sensitivity'
import { StepOutput } from './step-output'

export enum ExecutionType {
    BEGIN = 'BEGIN',
    RESUME = 'RESUME',
}

export type ExecutionState = {
    steps: Record<string, StepOutput>
    tags: string[]
    stepSensitivityManifests?: Record<string, SensitivityManifest>
}

export const ExecutionState = z.object({
    steps: z.record(z.string(), z.unknown()),
    tags: z.array(z.string()),
    stepSensitivityManifests: z.record(z.string(), SensitivityManifest).optional(),
})

export enum RunInternalErrorSource {
    ENGINE = 'ENGINE',
    WORKER = 'WORKER',
}

export const RunInternalError = z.object({
    source: z.enum(RunInternalErrorSource),
    message: z.string(),
    code: z.string().optional(),
    occurredAt: z.string(),
})

export type RunInternalError = z.infer<typeof RunInternalError>

export type ExecutioOutputFile = {
    executionState: ExecutionState
    internalError?: RunInternalError
    version?: number
}

export type ResumePayload = TriggerPayload
