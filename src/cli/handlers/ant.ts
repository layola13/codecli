function fail(command: string): never {
  process.stderr.write(
    `[ANT] ${command} is enabled in this build, but its internal implementation is not available in this repository.\n`
  );
  process.exit(1);
}

export async function logHandler(_logId?: string | number): Promise<never> {
  return fail("log");
}

export async function errorHandler(_number?: number): Promise<never> {
  return fail("error");
}

export async function exportHandler(
  _source: string,
  _outputFile: string
): Promise<never> {
  return fail("export");
}

export async function taskCreateHandler(
  _subject: string,
  _opts?: unknown
): Promise<never> {
  return fail("task create");
}

export async function taskListHandler(_opts?: unknown): Promise<never> {
  return fail("task list");
}

export async function taskGetHandler(
  _id: string,
  _opts?: unknown
): Promise<never> {
  return fail("task get");
}

export async function taskUpdateHandler(
  _id: string,
  _opts?: unknown
): Promise<never> {
  return fail("task update");
}

export async function taskDirHandler(_opts?: unknown): Promise<never> {
  return fail("task dir");
}

export async function completionHandler(
  _shell: string,
  _opts?: unknown,
  _program?: unknown
): Promise<never> {
  return fail("completion");
}
