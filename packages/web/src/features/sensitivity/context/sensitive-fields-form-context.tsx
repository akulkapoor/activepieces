import { createContext, useContext, type ReactNode } from 'react';

const SensitiveFieldsFormContext = createContext(false);

export function SensitiveFieldsFormProvider({
  enabled,
  children,
}: SensitiveFieldsFormProviderProps) {
  return (
    <SensitiveFieldsFormContext.Provider value={enabled}>
      {children}
    </SensitiveFieldsFormContext.Provider>
  );
}

export function useSensitiveFieldsFormEnabled(): boolean {
  return useContext(SensitiveFieldsFormContext);
}

type SensitiveFieldsFormProviderProps = {
  enabled: boolean;
  children: ReactNode;
};
