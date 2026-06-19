import { isNil, OutputSchemaFieldSnapshot, PiecePropertySnapshot } from '@activepieces/shared'
import type { OutputSchema } from '../output-schema'
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

export const pieceSensitivityUtils = {
    piecePropertyMapToSnapshots,
    outputSchemaToFieldSnapshots,
}
