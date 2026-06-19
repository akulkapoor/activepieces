import { pieceSensitivityUtils } from '../src/lib/sensitivity/sensitivity-property-snapshots'
import { PropertyType } from '../src/lib/property/input/property-type'
import { FlowActionType, FlowTriggerType } from '@activepieces/shared'
import { describe, expect, it } from 'vitest'

const baseStepProps = {
    name: 'step_1',
    valid: true,
    displayName: 'Step 1',
    lastUpdatedDate: '2024-01-01T00:00:00.000Z',
}

describe('pieceSensitivityUtils.buildManifestFromStep', () => {
    it('uses builder marks only for CODE steps', () => {
        const manifest = pieceSensitivityUtils.buildManifestFromStep({
            step: {
                ...baseStepProps,
                type: FlowActionType.CODE,
                settings: {
                    sourceCode: { code: '', packageJson: '{}' },
                    input: {},
                    sensitiveFields: {
                        input: ['customField'],
                        output: ['secretOutput'],
                    },
                },
            },
        })

        expect(manifest.input).toEqual(['customField'])
        expect(manifest.output).toEqual(['secretOutput'])
    })

    it('falls back to builder marks when piece action name is missing', () => {
        const manifest = pieceSensitivityUtils.buildManifestFromStep({
            step: {
                ...baseStepProps,
                type: FlowActionType.PIECE,
                settings: {
                    pieceName: '@activepieces/piece-http',
                    pieceVersion: '0.0.1',
                    propertySettings: {},
                    input: {},
                    sensitiveFields: {
                        input: ['customHeader'],
                    },
                },
            },
        })

        expect(manifest.input).toEqual(['customHeader'])
    })

    it('merges piece schema when component is provided', () => {
        const manifest = pieceSensitivityUtils.buildManifestFromStep({
            step: {
                ...baseStepProps,
                type: FlowActionType.PIECE,
                settings: {
                    pieceName: '@activepieces/piece-http',
                    pieceVersion: '0.0.1',
                    actionName: 'send_request',
                    propertySettings: {},
                    input: {},
                    sensitiveFields: {
                        output: ['customOutput'],
                    },
                },
            },
            pieceComponent: {
                props: {
                    apiKey: {
                        displayName: 'API Key',
                        required: true,
                        type: PropertyType.SECRET_TEXT,
                    },
                },
                outputSchema: {
                    fields: [
                        { key: 'access_token', sensitive: true },
                    ],
                },
                requireAuth: true,
            },
        })

        expect(manifest.input).toEqual(expect.arrayContaining(['apiKey', 'auth']))
        expect(manifest.output).toEqual(expect.arrayContaining(['access_token', 'customOutput']))
    })

    it('uses builder marks for piece triggers when component is missing', () => {
        const manifest = pieceSensitivityUtils.buildManifestFromStep({
            step: {
                ...baseStepProps,
                type: FlowTriggerType.PIECE,
                settings: {
                    pieceName: '@activepieces/piece-webhook',
                    pieceVersion: '0.0.1',
                    triggerName: 'catch_webhook',
                    propertySettings: {},
                    input: {},
                    sensitiveFields: {
                        output: ['payloadSecret'],
                    },
                },
            },
            pieceComponent: null,
        })

        expect(manifest.output).toEqual(['payloadSecret'])
    })
})

describe('pieceSensitivityUtils.resolvePieceComponentRequireAuth', () => {
    it('falls back to pieceHasAuth when requireAuth is omitted', () => {
        expect(pieceSensitivityUtils.resolvePieceComponentRequireAuth({
            pieceHasAuth: true,
        })).toBe(true)

        expect(pieceSensitivityUtils.resolvePieceComponentRequireAuth({
            pieceHasAuth: false,
        })).toBe(false)
    })

    it('requires both requireAuth and pieceHasAuth when requireAuth is explicit', () => {
        expect(pieceSensitivityUtils.resolvePieceComponentRequireAuth({
            requireAuth: true,
            pieceHasAuth: true,
        })).toBe(true)

        expect(pieceSensitivityUtils.resolvePieceComponentRequireAuth({
            requireAuth: true,
            pieceHasAuth: false,
        })).toBe(false)

        expect(pieceSensitivityUtils.resolvePieceComponentRequireAuth({
            requireAuth: false,
            pieceHasAuth: true,
        })).toBe(false)
    })
})
