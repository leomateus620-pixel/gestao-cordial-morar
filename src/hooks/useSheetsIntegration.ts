import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  disconnectSheet,
  getSheetConfig,
  importSheetRows,
  previewSheetRows,
  saveSheetConfig,
  type ImportResult,
  type SheetConfig,
  type SheetPreview,
} from "@/lib/financeiro/sheets.functions";

const CONFIG_KEY = ["financeiro", "sheets", "config"] as const;

export function useSheetsIntegration() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSheetConfig);
  const saveFn = useServerFn(saveSheetConfig);
  const previewFn = useServerFn(previewSheetRows);
  const importFn = useServerFn(importSheetRows);
  const disconnectFn = useServerFn(disconnectSheet);

  const configQuery = useQuery<SheetConfig | null>({
    queryKey: CONFIG_KEY,
    queryFn: () => getFn(),
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: CONFIG_KEY });

  const saveMutation = useMutation({
    mutationFn: (input: {
      spreadsheetIdOrUrl: string;
      sheetName: string;
      range: string;
      headerRow: number;
    }) => saveFn({ data: input }),
    onSuccess: invalidate,
  });

  const previewMutation = useMutation<SheetPreview, Error, { limit?: number } | void>({
    mutationFn: (input) => previewFn({ data: { limit: input?.limit ?? 10 } }),
  });

  const importMutation = useMutation<ImportResult, Error, void>({
    mutationFn: () => importFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financeiro", "lancamentos"] });
      invalidate();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: invalidate,
  });

  return {
    config: configQuery.data ?? null,
    isLoadingConfig: configQuery.isLoading,
    save: saveMutation,
    preview: previewMutation,
    import: importMutation,
    disconnect: disconnectMutation,
  };
}
