import { FriendlyPieceError, tryParseFriendlyPieceError } from '../../core/common/friendly-piece-error'
import { isNil } from '../../core/common/utils/utils'
import { StepOutput } from '../flow-run/execution/step-output'
import { FlowActionType } from '../flows/actions/action'
import {
    EMPTY_SENSITIVITY_MANIFEST,
    SENSITIVE_VALUE_PLACEHOLDER,
    SensitiveFields,
    SensitivityManifest,
} from './sensitivity'

const SENSITIVE_INPUT_PROPERTY_TYPES = new Set([
    'SECRET_TEXT',
    'OAUTH2',
    'BASIC_AUTH',
    'CUSTOM_AUTH',
    'OIDC',
])

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !isNil(value) && typeof value === 'object' && !Array.isArray(value)
}

function uniquePaths(paths: readonly string[]): string[] {
    return [...new Set(paths)]
}

function parsePathSegments(path: string): string[] {
    const segments: string[] = []
    for (const part of path.split('.')) {
        if (part.endsWith('[]')) {
            const key = part.slice(0, -2)
            if (key.length > 0) {
                segments.push(key)
            }
            segments.push('[]')
            continue
        }
        if (part.length > 0) {
            segments.push(part)
        }
    }
    return segments
}

function redactAtPath({ value, segments, segmentIndex }: RedactAtPathParams): unknown {
    if (segmentIndex >= segments.length) {
        return value
    }
    const segment = segments[segmentIndex]
    const isLastSegment = segmentIndex === segments.length - 1

    if (segment === '[]') {
        if (!Array.isArray(value)) {
            return value
        }
        if (isLastSegment) {
            return value.map(() => SENSITIVE_VALUE_PLACEHOLDER)
        }
        return value.map((entry) => redactAtPath({
            value: entry,
            segments,
            segmentIndex: segmentIndex + 1,
        }))
    }

    if (Array.isArray(value)) {
        return value.map((entry) => redactAtPath({
            value: entry,
            segments,
            segmentIndex,
        }))
    }

    if (!isObjectRecord(value)) {
        return value
    }

    if (!(segment in value)) {
        return value
    }

    if (isLastSegment) {
        return {
            ...value,
            [segment]: SENSITIVE_VALUE_PLACEHOLDER,
        }
    }

    return {
        ...value,
        [segment]: redactAtPath({
            value: value[segment],
            segments,
            segmentIndex: segmentIndex + 1,
        }),
    }
}

function redactValue({ value, paths }: RedactValueParams): unknown {
    if (paths.length === 0) {
        return value
    }
    let result = value
    for (const path of paths) {
        const segments = parsePathSegments(path)
        if (segments.length === 0) {
            continue
        }
        result = redactAtPath({
            value: result,
            segments,
            segmentIndex: 0,
        })
    }
    return result
}

function collectOutputSchemaPaths({
    fields,
    prefix,
}: CollectOutputSchemaPathsParams): string[] {
    const paths: string[] = []
    for (const field of fields) {
        const fieldPath = prefix.length > 0 ? `${prefix}.${field.key}` : field.key
        if (field.sensitive) {
            paths.push(fieldPath)
        }
        if (!isNil(field.children)) {
            paths.push(...collectOutputSchemaPaths({
                fields: field.children,
                prefix: fieldPath,
            }))
        }
        if (!isNil(field.listItems)) {
            for (const listItem of field.listItems) {
                const listItemPath = `${fieldPath}[].${listItem.key}`
                if (listItem.sensitive) {
                    paths.push(listItemPath)
                }
                if (!isNil(listItem.children)) {
                    paths.push(...collectOutputSchemaPaths({
                        fields: listItem.children,
                        prefix: listItemPath,
                    }))
                }
            }
        }
    }
    return paths
}

function collectInputPropertyPaths({
    properties,
    prefix,
}: CollectInputPropertyPathsParams): string[] {
    const paths: string[] = []
    for (const property of properties) {
        const propertyPath = prefix.length > 0 ? `${prefix}.${property.name}` : property.name
        if (SENSITIVE_INPUT_PROPERTY_TYPES.has(property.type)) {
            paths.push(propertyPath)
            continue
        }
        if (!isNil(property.properties) && property.properties.length > 0) {
            const nestedPrefix = property.type === 'ARRAY'
                ? `${propertyPath}[]`
                : propertyPath
            paths.push(...collectInputPropertyPaths({
                properties: property.properties,
                prefix: nestedPrefix,
            }))
        }
    }
    return paths
}

function buildSensitivityManifest({
    sensitiveFields,
    inputProperties,
    outputSchemaFields,
    includeAuthField,
}: BuildSensitivityManifestParams): SensitivityManifest {
    const schemaInputPaths = !isNil(inputProperties)
        ? collectInputPropertyPaths({ properties: inputProperties, prefix: '' })
        : []
    const authPaths = includeAuthField ? ['auth'] : []
    const builderInputPaths = sensitiveFields?.input ?? []
    const builderOutputPaths = sensitiveFields?.output ?? []
    const schemaOutputPaths = !isNil(outputSchemaFields)
        ? collectOutputSchemaPaths({ fields: outputSchemaFields, prefix: '' })
        : []

    return {
        input: uniquePaths([
            ...schemaInputPaths,
            ...authPaths,
            ...builderInputPaths,
        ]),
        output: uniquePaths([
            ...schemaOutputPaths,
            ...builderOutputPaths,
        ]),
    }
}

function redactStepOutput({
    stepOutput,
    manifest,
}: RedactStepOutputParams): Record<string, unknown> {
    const redacted: Record<string, unknown> = { ...stepOutput }
    if ('input' in stepOutput) {
        redacted['input'] = redactValue({
            value: stepOutput['input'],
            paths: manifest.input,
        })
    }
    if ('output' in stepOutput) {
        redacted['output'] = redactValue({
            value: stepOutput['output'],
            paths: manifest.output,
        })
    }
    if ('errorMessage' in stepOutput && typeof stepOutput['errorMessage'] === 'string') {
        redacted['errorMessage'] = redactPersistedErrorMessage({
            message: stepOutput['errorMessage'],
            manifest,
        })
    }
    return redacted
}

function tryParseJsonObject(value: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(value)
        if (isObjectRecord(parsed)) {
            return parsed
        }
    }
    catch {
        return undefined
    }
    return undefined
}

function redactPersistedErrorMessage({
    message,
    manifest,
}: RedactPersistedErrorMessageParams): string {
    if (manifest.input.length === 0 && manifest.output.length === 0) {
        return message
    }
    const errorPaths = uniquePaths([...manifest.input, ...manifest.output])
    const parsed = tryParseFriendlyPieceError(message)
    if (!isNil(parsed)) {
        return JSON.stringify(redactFriendlyPieceError({
            error: parsed,
            paths: errorPaths,
        }))
    }
    const jsonObject = tryParseJsonObject(message)
    if (!isNil(jsonObject)) {
        return JSON.stringify(redactValue({
            value: jsonObject,
            paths: errorPaths,
        }))
    }
    return message
}

function applyStepOutputRedaction<T extends PersistedStepOutputShape>({
    stepOutput,
    manifest,
}: ApplyStepOutputRedactionParams<T>): T {
    const redacted = redactStepOutput({ stepOutput, manifest })
    const redactedErrorMessage = redacted['errorMessage']
    return {
        ...stepOutput,
        input: redacted['input'],
        output: redacted['output'],
        ...(typeof redactedErrorMessage === 'string' ? { errorMessage: redactedErrorMessage } : {}),
    }
}

function redactSampleData({
    payload,
    manifest,
    type,
}: RedactSampleDataParams): unknown {
    if (manifest.input.length === 0 && manifest.output.length === 0) {
        return payload
    }
    const paths = type === 'input' ? manifest.input : manifest.output
    if (paths.length === 0) {
        return payload
    }
    return redactValue({ value: payload, paths })
}

function redactFriendlyPieceError({
    error,
    paths,
}: RedactFriendlyPieceErrorParams): FriendlyPieceError {
    const redacted: FriendlyPieceError = { ...error }
    if (!isNil(error.requestBody)) {
        redacted['requestBody'] = redactValue({
            value: error.requestBody,
            paths,
        })
    }
    if (!isNil(error.responseBody)) {
        redacted['responseBody'] = redactValue({
            value: error.responseBody,
            paths,
        })
    }
    if (!isNil(error.responseHeaders)) {
        const redactedHeaders = redactValue({
            value: error.responseHeaders,
            paths,
        })
        if (isObjectRecord(redactedHeaders)) {
            redacted.responseHeaders = redactedHeaders
        }
    }
    return redacted
}

function isSensitiveInputPropertyType(propertyType: string): boolean {
    return SENSITIVE_INPUT_PROPERTY_TYPES.has(propertyType)
}

function redactExecutionStep({
    step,
    stepName,
    stepSensitivityManifests,
}: RedactExecutionStepParams): StepOutput {
    const manifest = stepSensitivityManifests[stepName] ?? EMPTY_SENSITIVITY_MANIFEST
    const redactedBase = applyStepOutputRedaction({ stepOutput: step, manifest })

    if (step.type === FlowActionType.LOOP_ON_ITEMS && !isNil(step.output)) {
        const loopOutput = step.output
        const redactedIterations = loopOutput.iterations.map((iteration) =>
            redactExecutionSteps({ steps: iteration, stepSensitivityManifests }),
        )
        const redactedOutputFields = isObjectRecord(redactedBase.output) ? redactedBase.output : {}
        return Object.assign(
            Object.create(Object.getPrototypeOf(step)),
            step,
            {
                input: redactedBase.input,
                errorMessage: redactedBase.errorMessage,
                output: {
                    ...loopOutput,
                    ...redactedOutputFields,
                    iterations: redactedIterations,
                },
            },
        )
    }

    return Object.assign(
        Object.create(Object.getPrototypeOf(step)),
        step,
        {
            input: redactedBase.input,
            output: redactedBase.output,
            errorMessage: redactedBase.errorMessage,
        },
    )
}

function redactExecutionSteps({
    steps,
    stepSensitivityManifests,
}: RedactExecutionStepsParams): Record<string, StepOutput> {
    return Object.fromEntries(
        Object.entries(steps).map(([stepName, step]) => [
            stepName,
            redactExecutionStep({ step, stepName, stepSensitivityManifests }),
        ]),
    )
}

export const sensitivityUtils = {
    applyStepOutputRedaction,
    buildSensitivityManifest,
    redactExecutionSteps,
    redactValue,
    redactStepOutput,
    redactFriendlyPieceError,
    redactPersistedErrorMessage,
    redactSampleData,
    isSensitiveInputPropertyType,
    parsePathSegments,
}

type RedactAtPathParams = {
    value: unknown
    segments: string[]
    segmentIndex: number
}

type RedactValueParams = {
    value: unknown
    paths: readonly string[]
}

type PiecePropertySnapshot = {
    name: string
    type: string
    properties?: PiecePropertySnapshot[]
}

type OutputSchemaFieldSnapshot = {
    key: string
    sensitive?: boolean
    children?: OutputSchemaFieldSnapshot[]
    listItems?: OutputSchemaFieldSnapshot[]
}

type CollectOutputSchemaPathsParams = {
    fields: OutputSchemaFieldSnapshot[]
    prefix: string
}

type CollectInputPropertyPathsParams = {
    properties: PiecePropertySnapshot[]
    prefix: string
}

type BuildSensitivityManifestParams = {
    sensitiveFields?: SensitiveFields
    inputProperties?: PiecePropertySnapshot[]
    outputSchemaFields?: OutputSchemaFieldSnapshot[]
    includeAuthField?: boolean
}

type RedactStepOutputParams = {
    stepOutput: Record<string, unknown>
    manifest: SensitivityManifest
}

type RedactFriendlyPieceErrorParams = {
    error: FriendlyPieceError
    paths: readonly string[]
}

type PersistedStepOutputShape = {
    input: unknown
    output?: unknown
    errorMessage?: string
}

type ApplyStepOutputRedactionParams<T extends PersistedStepOutputShape> = {
    stepOutput: T
    manifest: SensitivityManifest
}

type RedactPersistedErrorMessageParams = {
    message: string
    manifest: SensitivityManifest
}

type RedactSampleDataParams = {
    payload: unknown
    manifest: SensitivityManifest
    type: 'input' | 'output'
}

type RedactExecutionStepParams = {
    step: StepOutput
    stepName: string
    stepSensitivityManifests: Readonly<Record<string, SensitivityManifest>>
}

type RedactExecutionStepsParams = {
    steps: Readonly<Record<string, StepOutput>>
    stepSensitivityManifests: Readonly<Record<string, SensitivityManifest>>
}

export type {
    ApplyStepOutputRedactionParams,
    BuildSensitivityManifestParams,
    OutputSchemaFieldSnapshot,
    PiecePropertySnapshot,
    PersistedStepOutputShape,
    RedactExecutionStepParams,
    RedactExecutionStepsParams,
    RedactFriendlyPieceErrorParams,
    RedactPersistedErrorMessageParams,
    RedactSampleDataParams,
    RedactStepOutputParams,
    RedactValueParams,
}
