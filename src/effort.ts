import { EvrenModelInfo } from './types';

export interface ModelSelection {
  id: string;
  model: EvrenModelInfo;
  effort?: string;
}

export function effortLabel(effort: string): string {
  if (effort === 'xhigh') { return 'Extra High'; }
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

export function effortLevels(model: EvrenModelInfo): string[] {
  return [...new Set((model.supportsReasoningEffort ?? []).filter(
    value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value)
  ))];
}

export function modelSelections(models: EvrenModelInfo[]): ModelSelection[] {
  const apiIds = new Set(models.map(model => model.id));
  return models.flatMap(model => [
    { id: model.id, model },
    ...effortLevels(model).map(effort => ({
      id: `evren-effort:${encodeURIComponent(model.id)}:${encodeURIComponent(effort)}`,
      model,
      effort,
    })).filter(selection => !apiIds.has(selection.id)),
  ]);
}

export function selectedEffort(selection: ModelSelection, enabled: boolean, fallback: string): string | undefined {
  const available = effortLevels(selection.model);
  if (selection.effort !== undefined) {
    return available.includes(selection.effort) ? selection.effort : undefined;
  }
  return enabled && available.includes(fallback) ? fallback : undefined;
}
