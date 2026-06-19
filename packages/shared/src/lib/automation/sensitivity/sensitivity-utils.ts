import { FriendlyPieceError, tryParseFriendlyPieceError } from '../../core/common/friendly-piece-error'
import { isNil } from '../../core/common/utils/utils'
import {
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
            paths.push(...collectInputPropertyPaths({
                properties: property.properties,
                prefix: propertyPath,
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
    if ('errorMessage' in stepOutput && !isNil(stepOutput['errorMessage'])) {
        const errorPaths = uniquePaths([...manifest.input, ...manifest.output])
        const parsed = tryParseFriendlyPieceError(stepOutput['errorMessage'])
        if (!isNil(parsed)) {
            redacted['errorMessage'] = JSON.stringify(redactFriendlyPieceError({
                error: parsed,
                paths: errorPaths,
            }))
        }
    }
    return redacted
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

export const sensitivityUtils = {
    buildSensitivityManifest,
    redactValue,
    redactStepOutput,
    redactFriendlyPieceError,
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

export type {
    BuildSensitivityManifestParams,
    OutputSchemaFieldSnapshot,
    PiecePropertySnapshot,
    RedactFriendlyPieceErrorParams,
    RedactStepOutputParams,
    RedactValueParams,
}
