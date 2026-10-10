import { Commands } from "@yukino.js/yukino";

export type CommandCandidate = Readonly<{
  name: string;
  description: string;
  aliases: readonly string[];
  type: string;
}>;

export const buildCommandCandidates = (): CommandCandidate[] => {
  const registry = Commands.Commands.createDefaultRegistry();
  for (const command of Commands.Loader.loadUserCommands()) {
    if (registry.find(command.name) === undefined) registry.register(command);
  }
  return registry.listCommands().map((command) => ({
    aliases: [],
    description: command.description,
    name: command.name,
    type: command.type,
  }));
};

export type ParsedCommand = Readonly<{ name: string; args: string }>;

export const parseCommand = (input: string): ParsedCommand | null => Commands.Commands.parse(input);

export const SERVER_SUPPORTED_COMMANDS = new Set([
  "help",
  "status",
  "clear",
  "compact",
  "skills",
  "skill",
  "memory",
  "mcp",
  "rewind",
]);

export const isSkillCommand = (name: string): boolean => name === "skill";
