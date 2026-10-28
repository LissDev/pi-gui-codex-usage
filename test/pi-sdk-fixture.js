export const SessionManager = {
  async listAll() { throw new Error('Tests must inject sessionCatalog'); },
};

export function parseSessionEntries(content) {
  return content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}
