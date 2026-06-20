import { SensitiveFields, MarkdownVariant } from '@activepieces/shared';
import { t } from 'i18next';
import { Plus, TrashIcon } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

import { ApMarkdown } from '@/components/custom/markdown';
import { TextWithIcon } from '@/components/custom/text-with-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { sensitiveFieldsFormUtils } from '../utils/sensitive-fields-form-utils';

import { SensitiveFieldToggle } from './sensitive-field-toggle';

export function SensitiveCodeFieldsSection({
  inputKeys,
  disabled,
}: SensitiveCodeFieldsSectionProps) {
  const form = useFormContext<{
    settings: { sensitiveFields?: SensitiveFields };
  }>();
  const sensitiveFields = form.watch('settings.sensitiveFields');
  const outputPaths = sensitiveFields?.output ?? [];

  const addOutputPath = () => {
    form.setValue(
      'settings.sensitiveFields',
      sensitiveFieldsFormUtils.normalizeSensitiveFields({
        input: sensitiveFields?.input,
        output: [...outputPaths, ''],
      }),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const updateOutputPath = ({ index, value }: UpdateOutputPathParams) => {
    const next = outputPaths.map((path, pathIndex) =>
      pathIndex === index ? value : path,
    );
    form.setValue(
      'settings.sensitiveFields',
      sensitiveFieldsFormUtils.normalizeSensitiveFields({
        input: sensitiveFields?.input,
        output: next.filter((path) => path.length > 0),
      }),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const removeOutputPath = (index: number) => {
    const next = outputPaths.filter((_, pathIndex) => pathIndex !== index);
    form.setValue(
      'settings.sensitiveFields',
      sensitiveFieldsFormUtils.normalizeSensitiveFields({
        input: sensitiveFields?.input,
        output: next,
      }),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <ApMarkdown
        markdown={t(
          'Redacted values are replaced with [REDACTED] in run history and logs.',
        )}
        variant={MarkdownVariant.INFO}
      />

      {inputKeys.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {t('Sensitive input fields')}
          </span>
          {inputKeys.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 min-h-8"
            >
              <span className="text-sm truncate">{key}</span>
              <SensitiveFieldToggle
                path={key}
                side="input"
                schemaLocked={false}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t('Sensitive output fields')}
        </span>
        {outputPaths.map((path, index) => (
          <div
            key={`sensitive-output-${index}`}
            className="flex items-center gap-2"
          >
            <Input
              value={path}
              disabled={disabled}
              placeholder={t('Output field path')}
              onChange={(event) =>
                updateOutputPath({ index, value: event.target.value })
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              disabled={disabled}
              onClick={() => removeOutputPath(index)}
            >
              <TrashIcon
                className="size-4 text-destructive"
                aria-hidden="true"
              />
              <span className="sr-only">{t('Remove')}</span>
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={disabled}
          onClick={addOutputPath}
        >
          <TextWithIcon
            icon={<Plus size={18} />}
            text={t('Add sensitive output field')}
          />
        </Button>
      </div>
    </div>
  );
}

type SensitiveCodeFieldsSectionProps = {
  inputKeys: string[];
  disabled?: boolean;
};

type UpdateOutputPathParams = {
  index: number;
  value: string;
};
