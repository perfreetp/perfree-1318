export {};

declare global {
  interface Window {
    electronAPI?: {
      saveFile: (
        defaultPath: string,
        content: string,
        filters?: { name: string; extensions: string[] }[]
      ) => Promise<{ success: boolean; filePath?: string }>;
      openFile: (
        filters?: { name: string; extensions: string[] }[],
        properties?: string[]
      ) => Promise<{ success: boolean; filePath?: string; content?: string }>;
    };
  }
}
