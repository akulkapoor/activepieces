import { OutputSchema } from '@activepieces/pieces-framework';
import { MarkdownVariant } from '@activepieces/shared';
import { t } from 'i18next';

import { ApMarkdown } from '@/components/custom/markdown';

import { sensitiveFieldsFormUtils } from '../utils/sensitive-fields-form-utils';

import { SensitiveFieldToggle } from './sensitive-field-toggle';

export function SensitiveOutputFieldsSection({
  outputSchema,
  disabled,
}: SensitiveOutputFieldsSectionProps) {
  const fields = sensitiveFieldsFormUtils.flattenOutputSchemaFields({
    fields: outputSchema?.fields ?? [],
    prefix: '',
  });

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {t('Sensitive output fields')}
        </span>
        <ApMarkdown
          markdown={t(
            'Redacted values are replaced with [REDACTED] in run history and logs.',
          )}
          variant={MarkdownVariant.INFO}
        />
      </div>
      <div className="flex flex-col gap-2">
        {fields.map((field) => (
          <div
            key={field.path}
            className="flex items-center justify-between gap-2 min-h-8"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-sm truncate">{field.label}</span>
              <span className="text-xs text-muted-foreground truncate">
                {field.path}
              </span>
            </div>
            <SensitiveFieldToggle
              path={field.path}
              side="output"
              schemaLocked={field.schemaSensitive}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type SensitiveOutputFieldsSectionProps = {
  outputSchema?: OutputSchema;
  disabled?: boolean;
};
