export interface ShellRuntimeInfo {
  platform: NodeJS.Platform;
  shell: "powershell" | "bash";
  executable: "powershell.exe" | "/bin/bash";
  invocation: string;
  guidance: string;
}

export function getShellRuntimeInfo(platform: NodeJS.Platform = process.platform): ShellRuntimeInfo {
  if (platform === "win32") {
    return {
      platform,
      shell: "powershell",
      executable: "powershell.exe",
      invocation: "powershell.exe -NoLogo -NoProfile -EncodedCommand <command>",
      guidance: "Windows runs commands through PowerShell; use PowerShell syntax, semicolon-separated commands, node -e, python -c, or an explicit bash invocation for Bash/POSIX syntax.",
    };
  }

  return {
    platform,
    shell: "bash",
    executable: "/bin/bash",
    invocation: "/bin/bash -lc <command>",
    guidance: "Unix-like platforms run commands through bash -lc; use Bash syntax.",
  };
}
