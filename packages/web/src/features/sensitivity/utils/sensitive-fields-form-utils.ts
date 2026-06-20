import { OutputSchemaField } from '@activepieces/pieces-framework';
import { SensitiveFields, sensitivityUtils } from '@activepieces/shared';

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function normalizeSensitiveFields({
  input,
  output,
}: NormalizeSensitiveFieldsParams): SensitiveFields | undefined {
  const result: SensitiveFields = {};
  if (input && input.length > 0) {
    result.input = input;
  }
  if (output && output.length > 0) {
    result.output = output;
  }
  if (Object.keys(result).length === 0) {
    return undefined;
  }
  return result;
}

function isPathMarked({
  sensitiveFields,
  side,
  path,
}: PathSideParams): boolean {
  return sensitiveFields?.[side]?.includes(path) ?? false;
}

function setPathMarked({
  sensitiveFields,
  side,
  path,
  marked,
}: SetPathMarkedParams): SensitiveFields | undefined {
  const current = sensitiveFields?.[side] ?? [];
  const nextPaths = marked
    ? uniquePaths([...current, path])
    : current.filter((entry) => entry !== path);
  return normalizeSensitiveFields({
    input: side === 'input' ? nextPaths : sensitiveFields?.input,
    output: side === 'output' ? nextPaths : sensitiveFields?.output,
  });
}

function flattenOutputSchemaFields({
  fields,
  prefix,
}: FlattenOutputSchemaFieldsParams): OutputFieldOption[] {
  const options: OutputFieldOption[] = [];
  for (const field of fields) {
    const path = prefix.length > 0 ? `${prefix}.${field.key}` : field.key;
    const label = field.label ?? field.key;
    options.push({
      path,
      label,
      schemaSensitive: field.sensitive ?? false,
    });
    if (field.children) {
      options.push(
        ...flattenOutputSchemaFields({
          fields: field.children,
          prefix: path,
        }),
      );
    }
    if (field.listItems) {
      for (const listItem of field.listItems) {
        const listItemPath = `${path}[].${listItem.key}`;
        options.push({
          path: listItemPath,
          label: `${label} → ${listItem.label ?? listItem.key}`,
          schemaSensitive: listItem.sensitive ?? false,
        });
        if (listItem.children) {
          options.push(
            ...flattenOutputSchemaFields({
              fields: listItem.children,
              prefix: listItemPath,
            }),
          );
        }
      }
    }
  }
  return options;
}

function isSchemaSensitiveInputProperty(propertyType: string): boolean {
  return sensitivityUtils.isSensitiveInputPropertyType(propertyType);
}

function shouldShowInputSensitiveToggle(propertyType: string): boolean {
  return propertyType !== 'MARKDOWN' && propertyType !== 'CHECKBOX';
}

export const sensitiveFieldsFormUtils = {
  flattenOutputSchemaFields,
  isPathMarked,
  isSchemaSensitiveInputProperty,
  normalizeSensitiveFields,
  setPathMarked,
  shouldShowInputSensitiveToggle,
};

export type OutputFieldOption = {
  path: string;
  label: string;
  schemaSensitive: boolean;
};

type FlattenOutputSchemaFieldsParams = {
  fields: OutputSchemaField[];
  prefix: string;
};

type NormalizeSensitiveFieldsParams = {
  input?: string[];
  output?: string[];
};

type PathSideParams = {
  sensitiveFields?: SensitiveFields;
  side: SensitiveFieldSide;
  path: string;
};

type SetPathMarkedParams = PathSideParams & {
  marked: boolean;
};

export type SensitiveFieldSide = 'input' | 'output';
