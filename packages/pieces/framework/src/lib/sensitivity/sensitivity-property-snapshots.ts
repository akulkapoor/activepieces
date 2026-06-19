import {
    EMPTY_SENSITIVITY_MANIFEST,
    FlowActionType,
    FlowTriggerType,
    isNil,
    OutputSchemaFieldSnapshot,
    PiecePropertySnapshot,
    SensitiveFields,
    sensitivityUtils,
    SensitivityManifest,
    Step,
} from '@activepieces/shared'
import type { OutputSchema } from '../output-schema'
import { PieceAuthProperty } from '../property/authentication'
import { PieceProperty, PiecePropertyMap } from '../property'
import { PropertyType } from '../property/input/property-type'

function extractNestedInputProperties(property: PieceProperty): { properties?: PiecePropertySnapshot[] } {
    if (property.type === PropertyType.ARRAY && !isNil(property.properties)) {
        return {
            properties: Object.entries(property.properties).map(([nestedName, nestedProperty]) => ({
                name: nestedName,
                type: nestedProperty.type,
            })),
        }
    }
    return {}
}

function piecePropertyMapToSnapshots(propertyMap: PiecePropertyMap): PiecePropertySnapshot[] {
    return Object.entries(propertyMap).map(([name, property]) => ({
        name,
        type: property.type,
        ...extractNestedInputProperties(property),
    }))
}

function outputSchemaToFieldSnapshots(outputSchema: OutputSchema | undefined): OutputSchemaFieldSnapshot[] | undefined {
    if (isNil(outputSchema)) {
        return undefined
    }
    return outputSchema.fields
}

function buildManifestFromComponent({
    sensitiveFields,
    props,
    outputSchema,
    requireAuth,
}: BuildManifestFromComponentParams): SensitivityManifest {
    return sensitivityUtils.buildSensitivityManifest({
        sensitiveFields,
        inputProperties: piecePropertyMapToSnapshots(props),
        outputSchemaFields: outputSchemaToFieldSnapshots(outputSchema),
        includeAuthField: requireAuth,
    })
}

function pieceHasAuth(auth: PieceAuthProperty | PieceAuthProperty[] | undefined): boolean {
    return !isNil(auth)
}

function resolvePieceComponentRequireAuth({
    requireAuth,
    pieceHasAuth: pieceDefinesAuth,
}: ResolvePieceComponentRequireAuthParams): boolean {
    if (typeof requireAuth === 'boolean') {
        return requireAuth && pieceDefinesAuth
    }
    return pieceDefinesAuth
}

function buildManifestFromStep({
    step,
    pieceComponent,
}: BuildManifestFromStepParams): SensitivityManifest {
    switch (step.type) {
        case FlowActionType.PIECE: {
            const pieceAction = step
            if (isNil(pieceAction.settings.actionName) || isNil(pieceComponent)) {
                return sensitivityUtils.buildSensitivityManifest({
                    sensitiveFields: pieceAction.settings.sensitiveFields,
                })
            }
            return buildManifestFromComponent({
                sensitiveFields: pieceAction.settings.sensitiveFields,
                props: pieceComponent.props,
                outputSchema: pieceComponent.outputSchema,
                requireAuth: pieceComponent.requireAuth,
            })
        }
        case FlowActionType.CODE:
        case FlowActionType.ROUTER:
        case FlowActionType.LOOP_ON_ITEMS:
            return sensitivityUtils.buildSensitivityManifest({
                sensitiveFields: step.settings.sensitiveFields,
            })
        case FlowTriggerType.PIECE: {
            const pieceTrigger = step
            if (isNil(pieceTrigger.settings.triggerName) || isNil(pieceComponent)) {
                return sensitivityUtils.buildSensitivityManifest({
                    sensitiveFields: pieceTrigger.settings.sensitiveFields,
                })
            }
            return buildManifestFromComponent({
                sensitiveFields: pieceTrigger.settings.sensitiveFields,
                props: pieceComponent.props,
                outputSchema: pieceComponent.outputSchema,
                requireAuth: pieceComponent.requireAuth,
            })
        }
        default:
            return EMPTY_SENSITIVITY_MANIFEST
    }
}

export const pieceSensitivityUtils = {
    buildManifestFromComponent,
    buildManifestFromStep,
    pieceHasAuth,
    piecePropertyMapToSnapshots,
    outputSchemaToFieldSnapshots,
    resolvePieceComponentRequireAuth,
}

type BuildManifestFromComponentParams = {
    sensitiveFields?: SensitiveFields
    props: PiecePropertyMap
    outputSchema?: OutputSchema
    requireAuth: boolean
}

type BuildManifestFromStepParams = {
    step: Step
    pieceComponent?: PieceComponentForSensitivityManifest | null
}

export type PieceComponentForSensitivityManifest = {
    props: PiecePropertyMap
    outputSchema?: OutputSchema
    requireAuth: boolean
}

type ResolvePieceComponentRequireAuthParams = {
    requireAuth?: boolean
    pieceHasAuth: boolean
}
