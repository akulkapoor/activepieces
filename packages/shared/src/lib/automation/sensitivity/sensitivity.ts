import { z } from 'zod'

export const SENSITIVE_VALUE_PLACEHOLDER = '[REDACTED]'

export const SensitiveFields = z.object({
    input: z.array(z.string()).optional(),
    output: z.array(z.string()).optional(),
})

export type SensitiveFields = z.infer<typeof SensitiveFields>

export const SensitivityManifest = z.object({
    input: z.array(z.string()),
    output: z.array(z.string()),
})

export type SensitivityManifest = z.infer<typeof SensitivityManifest>

export const EMPTY_SENSITIVITY_MANIFEST: SensitivityManifest = {
    input: [],
    output: [],
}
