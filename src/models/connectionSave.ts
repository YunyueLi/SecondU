// A failed save or test keeps the caller's exact draft and password input.
// Publish a successful save immediately so retries update the same connection.
export async function saveConnectionForm<Connection, Result extends { ok: boolean }>({
  persist, test, onPersisted, acceptInput,
}: {
  persist: () => Promise<Connection>;
  test?: (connection: Connection) => Promise<Result>;
  onPersisted: (connection: Connection) => Promise<void>;
  acceptInput: (connection: Connection) => void;
}): Promise<{ connection: Connection; result?: Result }> {
  const connection = await persist();
  await onPersisted(connection);
  const result = test ? await test(connection) : undefined;
  if (!result || result.ok) acceptInput(connection);
  return { connection, result };
}
