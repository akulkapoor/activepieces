import { describe, expect, it } from 'vitest'

import { SENSITIVE_VALUE_PLACEHOLDER } from '../../../src/lib/automation/sensitivity/sensitivity'
import { sensitivityUtils } from '../../../src/lib/automation/sensitivity/sensitivity-utils'

describe('sensitivityUtils.buildSensitivityManifest', () => {
    it('merges piece schema paths with builder marks', () => {
        const manifest = sensitivityUtils.buildSensitivityManifest({
            sensitiveFields: {
                input: ['customNote'],
                output: ['customerEmail'],
            },
            inputProperties: [
                { name: 'apiKey', type: 'SECRET_TEXT' },
                { name: 'title', type: 'SHORT_TEXT' },
            ],
            outputSchemaFields: [
                { key: 'access_token', sensitive: true },
                { key: 'name' },
            ],
            includeAuthField: true,
        })

        expect(manifest.input).toEqual(expect.arrayContaining(['apiKey', 'auth', 'customNote']))
        expect(manifest.output).toEqual(expect.arrayContaining(['access_token', 'customerEmail']))
        expect(manifest.input).not.toContain('title')
    })

    it('collects ARRAY nested SECRET_TEXT paths with [] wildcard', () => {
        const manifest = sensitivityUtils.buildSensitivityManifest({
            inputProperties: [
                {
                    name: 'items',
                    type: 'ARRAY',
                    properties: [
                        { name: 'apiKey', type: 'SECRET_TEXT' },
                    ],
                },
            ],
        })

        expect(manifest.input).toEqual(['items[].apiKey'])
    })
})

describe('sensitivityUtils.redactValue', () => {
    it('redacts a top-level field', () => {
        const result = sensitivityUtils.redactValue({
            value: { apiKey: 'secret-key', title: 'hello' },
            paths: ['apiKey'],
        })

        expect(result).toEqual({
            apiKey: SENSITIVE_VALUE_PLACEHOLDER,
            title: 'hello',
        })
    })

    it('redacts nested and array wildcard paths', () => {
        const result = sensitivityUtils.redactValue({
            value: {
                rows: [
                    { email: 'a@example.com', id: '1' },
                    { email: 'b@example.com', id: '2' },
                ],
            },
            paths: ['rows[].email'],
        })

        expect(result).toEqual({
            rows: [
                { email: SENSITIVE_VALUE_PLACEHOLDER, id: '1' },
                { email: SENSITIVE_VALUE_PLACEHOLDER, id: '2' },
            ],
        })
    })
})

describe('sensitivityUtils.redactStepOutput', () => {
    it('redacts input, output, and friendly error bodies', () => {
        const redacted = sensitivityUtils.redactStepOutput({
            stepOutput: {
                input: { apiKey: 'secret-key' },
                output: { access_token: 'token-value', name: 'Acme' },
                errorMessage: JSON.stringify({
                    __apErrorVersion: 1,
                    message: 'Request failed',
                    requestBody: { apiKey: 'secret-key', title: 'hello' },
                    responseBody: { access_token: 'token-value' },
                }),
            },
            manifest: {
                input: ['apiKey'],
                output: ['access_token'],
            },
        })

        expect(redacted.input).toEqual({ apiKey: SENSITIVE_VALUE_PLACEHOLDER })
        expect(redacted.output).toEqual({
            access_token: SENSITIVE_VALUE_PLACEHOLDER,
            name: 'Acme',
        })

        const parsedError = JSON.parse(String(redacted.errorMessage))
        expect(parsedError.requestBody.apiKey).toBe(SENSITIVE_VALUE_PLACEHOLDER)
        expect(parsedError.requestBody.title).toBe('hello')
        expect(parsedError.responseBody.access_token).toBe(SENSITIVE_VALUE_PLACEHOLDER)
    })

    it('redacts JSON object error messages', () => {
        const redacted = sensitivityUtils.redactStepOutput({
            stepOutput: {
                input: {},
                output: {},
                errorMessage: JSON.stringify({
                    apiKey: 'secret-key',
                    detail: 'failed',
                }),
            },
            manifest: {
                input: ['apiKey'],
                output: [],
            },
        })

        const parsedError = JSON.parse(String(redacted.errorMessage))
        expect(parsedError.apiKey).toBe(SENSITIVE_VALUE_PLACEHOLDER)
        expect(parsedError.detail).toBe('failed')
    })
})

describe('sensitivityUtils.redactPersistedErrorMessage', () => {
    it('redacts friendly piece errors', () => {
        const message = JSON.stringify({
            __apErrorVersion: 1,
            message: 'Request failed',
            requestBody: { apiKey: 'secret-key' },
        })
        const redacted = sensitivityUtils.redactPersistedErrorMessage({
            message,
            manifest: { input: ['apiKey'], output: [] },
        })
        const parsed = JSON.parse(redacted)
        expect(parsed.requestBody.apiKey).toBe(SENSITIVE_VALUE_PLACEHOLDER)
    })
})
