export async function queueExportWithLatestProject<T>(options: {
  hasUnsavedChanges: boolean;
  persistLatestProject: () => Promise<boolean>;
  enqueue: () => Promise<T>;
}): Promise<T | null> {
  if (options.hasUnsavedChanges && !(await options.persistLatestProject())) {
    return null;
  }

  return options.enqueue();
}
