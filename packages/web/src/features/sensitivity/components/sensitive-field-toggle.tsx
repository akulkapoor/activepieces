import { SensitiveFields } from '@activepieces/shared';
import { t } from 'i18next';
import { EyeOff } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import {
  sensitiveFieldsFormUtils,
  SensitiveFieldSide,
} from '../utils/sensitive-fields-form-utils';

export function SensitiveFieldToggle({
  path,
  side,
  schemaLocked,
  disabled,
}: SensitiveFieldToggleProps) {
  const form = useFormContext<{
    settings: { sensitiveFields?: SensitiveFields };
  }>();
  const sensitiveFields = form.watch('settings.sensitiveFields');
  const builderMarked = sensitiveFieldsFormUtils.isPathMarked({
    sensitiveFields,
    side,
    path,
  });
  const isOn = schemaLocked || builderMarked;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          pressed={isOn}
          onPressedChange={(pressed) => {
            if (schemaLocked || disabled) {
              return;
            }
            form.setValue(
              'settings.sensitiveFields',
              sensitiveFieldsFormUtils.setPathMarked({
                sensitiveFields,
                side,
                path,
                marked: pressed,
              }),
              { shouldDirty: true, shouldValidate: true },
            );
          }}
          disabled={disabled || schemaLocked}
          size="sm"
          aria-label={t('Mark as sensitive')}
        >
          <EyeOff
            className={cn('size-5', {
              'text-foreground': isOn,
              'text-muted-foreground': !isOn,
            })}
          />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="top">
        {schemaLocked
          ? t('Always redacted by piece definition')
          : t('Mark as sensitive')}
      </TooltipContent>
    </Tooltip>
  );
}

type SensitiveFieldToggleProps = {
  path: string;
  side: SensitiveFieldSide;
  schemaLocked: boolean;
  disabled?: boolean;
};
