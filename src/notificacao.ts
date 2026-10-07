import { spawn } from "node:child_process";

const escaparXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Script PowerShell que mostra uma notificação nativa do Windows 10/11 (clicar abre `url`). */
export function scriptNotificacao(titulo: string, corpo: string, url?: string): string {
  const atributos = url ? ` activationType="protocol" launch="${escaparXml(url)}"` : "";
  const xml = `<toast${atributos}><visual><binding template="ToastGeneric"><text>${escaparXml(titulo)}</text><text>${escaparXml(corpo)}</text></binding></visual></toast>`;
  return [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
    "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    "$xml.LoadXml(@'",
    xml,
    "'@)",
    "$toast = New-Object Windows.UI.Notifications.ToastNotification $xml",
    "$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)",
  ].join("\r\n");
}

/** Mostra uma notificação do Windows. Noutros sistemas (ou se falhar) não faz nada. */
export function notificar(titulo: string, corpo: string, url?: string): Promise<void> {
  if (process.platform !== "win32") return Promise.resolve();
  const codificado = Buffer.from(scriptNotificacao(titulo, corpo, url), "utf16le").toString("base64");
  return new Promise((resolve) => {
    try {
      const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", codificado], {
        stdio: "ignore",
        windowsHide: true,
      });
      p.on("error", () => resolve());
      p.on("exit", () => resolve());
      setTimeout(resolve, 8000).unref();
    } catch {
      resolve();
    }
  });
}
